from __future__ import unicode_literals
from urllib.parse import urlparse

import frappe
from frappe import _
import http.client
import json, re
import string
import datetime

@frappe.whitelist()
def enqueue_verloop_campaigns():

    frappe.enqueue(
        method='verloop.verloop.api.verloop_api.get_verloop_campaigns',
        queue='long',
        timeout=3600, 
        job_name='Sync Verloop Campaigns'
    )
    
    return [True, "Campaign sync job has been queued. Please check the Frappe Error Log for progress."]


def get_verloop_campaigns():
    try:
        if not frappe.db.exists("DocType", "Verloop Settings"):
            frappe.log_error("Verloop Settings doctype not found", "Verloop Campaign Sync")
            return

        settings_doc = frappe.get_doc("Verloop Settings")
        
        base_path = settings_doc.base_path
        client_id = settings_doc.client_id
        
        if not base_path or not client_id:       
            frappe.log_error("Verloop Settings not configured properly", "Verloop Campaign Sync")
            return

        auth_key = settings_doc.get_password("api_key")
        
        if not auth_key:
            frappe.log_error("API Key not configured", "Verloop Campaign Sync")
            return

        # Constants
        campaign_type = getattr(settings_doc, "campaign_type", 1)
        limit = 100  
        
        # Tracking variables
        total_campaigns_imported = 0
        total_campaigns_skipped = 0
        count = 0
        total_count = None

        while True:
            # Calculate offset
            offset = count * limit

            payload = json.dumps({
                "ListOption": {
                    "limit": limit,
                    "offset": offset
                },
                "Type": campaign_type
            })

            headers = {
                'accept': "application/json",
                'Authorization': auth_key
            }
            
            url = f"https://{client_id}.verloop.io{base_path}/outreach/list-campaigns"
            parsed_url = urlparse(url)
            hostname = parsed_url.netloc
            endpoint = parsed_url.path

            conn = http.client.HTTPSConnection(hostname)
            conn.request("POST", endpoint, body=payload, headers=headers)
            response = conn.getresponse()

            data = response.read()
            response_data = json.loads(data.decode("utf-8"))

            if total_count is None:
                total_count = response_data.get("Count", 0)
                frappe.log_error(f"Total Campaigns to Sync: {total_count}", "Verloop Campaign Sync")

            if not response_data.get("Campaigns"):
                break

            result = create_campaign_records(response_data.get("Campaigns", []))
            
            # Update tracking
            if result[0]:  
                # Extract numbers from result message
                import re
                imported = int(re.search(r'Imported (\d+)', result[1]).group(1))
                skipped = int(re.search(r'skipped (\d+)', result[1]).group(1))
                
                total_campaigns_imported += imported
                total_campaigns_skipped += skipped

            count += 1

            if (count * limit) >= total_count:
                break

        frappe.log_error(
            f"Verloop Campaign Sync Complete. "
            f"Total Campaigns: {total_count}, "
            f"Imported: {total_campaigns_imported}, "
            f"Skipped: {total_campaigns_skipped}",
            "Verloop Campaign Sync"
        )

    except Exception as e:
        frappe.log_error(f"Verloop Campaign Sync Error: {str(e)}", "Verloop Campaign Sync")
    

def create_campaign_records(filtered_campaigns):
    try:
        if not filtered_campaigns:
            return [True, "No new campaigns to import"]

        created_count = 0
        skipped_count = 0
        error_campaigns = []
        updated_templates = 0
        template_errors = 0

        STATUS_MAPPING = {
            "0": "UNKNOWN",
            "1": "DRAFT",
            "2": "PUBLISHED",
            "3": "DISABLED"
        }

        for campaign in filtered_campaigns:
            meta = campaign.get("Meta", {})
            campaign_id = meta.get("Id")

            if not campaign_id:
                error_campaigns.append({"name": campaign.get("Name", "Unknown"), "error": "Missing campaign ID"})
                continue  

            if frappe.db.exists("Verloop Campaigns", {"campaign_id": campaign_id}):
                skipped_count += 1
                continue  

            campaign_name = campaign.get("Name", "")
            # status = campaign.get("Status", "")

            raw_status = str(campaign.get("Status", ""))
            status = STATUS_MAPPING.get(raw_status, "")

            campaign_type = campaign.get("Type", "1")
            template_id = campaign.get("TemplateID", "")

            #creating template record by id
            if template_id:
                try:
                    template_result = update_verloop_template(template_id)
                    if template_result[0]:
                        updated_templates += 1
                    else:
                        frappe.log_error(f"Template update failed for ID {template_id}: {template_result[1]}", 
                                       "Verloop Template Update")
                        template_errors += 1
                except Exception as e:
                    frappe.log_error(f"Exception in template update for ID {template_id}: {str(e)}", 
                                   "Verloop Template Update")
                    template_errors += 1

            # Handle timestamps
            created_at = meta.get("CreatedAt")
            updated_at = meta.get("UpdatedAt")

            # Create a new campaign record
            new_campaign = frappe.get_doc({
                "doctype": "Verloop Campaigns",
                "campaign_id": campaign_id,  
                "campaign_name": campaign_name,
                "status": status,
                "campaign_type": campaign_type,
                "template_id": template_id
            })
            
            if created_at:
                try:
                    new_campaign.creation_time = frappe.utils.get_datetime(
                        datetime.datetime.fromtimestamp(created_at)
                    )
                except Exception as e:
                    frappe.log_error(f"Creation time error: {str(e)}", "Verloop Campaign Import")
                    pass
            
            if updated_at:
                try:
                    new_campaign.updation_time = frappe.utils.get_datetime(
                        datetime.datetime.fromtimestamp(updated_at)
                    )
                except Exception as e:
                    frappe.log_error(f"Updation time error: {str(e)}", "Verloop Campaign Import")
                    pass
                
            new_campaign.save(ignore_permissions=True)
            created_count += 1

        frappe.log_error("Before inserting:", campaign.as_dict())
        frappe.db.commit()  

        # Prepare result message
        result_message = f"Imported {created_count} campaigns, skipped {skipped_count}"
        if error_campaigns:
            result_message += f", errors in {len(error_campaigns)} campaigns"
            frappe.log_error(f"Import Errors: {json.dumps(error_campaigns)}", "Verloop Campaign Import")

        return [True, result_message]

    except Exception as e:
        frappe.log_error(f"Critical Error: {str(e)}", "Verloop Campaign Import")
        return [False, f"Processing failed: {str(e)}"]
    


@frappe.whitelist()
def update_verloop_campaign(campaign_id):
    try:
        if not frappe.db.exists("DocType", "Verloop Settings"):
            return [False, "Verloop Settings doctype not found"]
        
        STATUS_MAPPING = {
            "0": "UNKNOWN",
            "1": "DRAFT",
            "2": "PUBLISHED",
            "3": "DISABLED"
        }
            
        settings_doc = frappe.get_doc("Verloop Settings")
        
        base_path = settings_doc.base_path
        client_id = settings_doc.client_id
        
        if not base_path or not client_id:       
            return [False, "Verloop Settings is not Configured Properly"]
            
        auth_key = settings_doc.get_password("api_key")
        
        if not auth_key:
            return [False, "API Key not configured properly"]

        payload = json.dumps({
            "ID": campaign_id
        })
        
        headers = {
            'accept': "application/json",
            'Authorization': auth_key,
            'Content-Type': 'application/json'
        }
        
        url = f"https://{client_id}.verloop.io{base_path}/outreach/get-campaign"
        parsed_url = urlparse(url)
        hostname = parsed_url.netloc
        endpoint = parsed_url.path

        conn = http.client.HTTPSConnection(hostname)
        conn.request("POST", endpoint, body=payload, headers=headers)
        response = conn.getresponse()

        data = response.read()
        response_data = json.loads(data.decode("utf-8"))

        campaign = response_data.get("Campaign", {})
        meta = campaign.get("Meta", {})

        doc = frappe.get_doc("Verloop Campaigns", campaign_id)

        doc.campaign_name = campaign.get("Name", doc.campaign_name)
        
        # doc.status = campaign.get("Status", doc.status)
        response_status = str(campaign.get("Status", ""))
        if response_status in STATUS_MAPPING:
            doc.status = STATUS_MAPPING[response_status]

        doc.campaign_type = campaign.get("Type", doc.campaign_type)
        doc.template_id = campaign.get("TemplateID", doc.template_id)
   
        if meta.get("CreatedAt"):
            doc.creation_time = frappe.utils.get_datetime(
                datetime.datetime.fromtimestamp(meta.get("CreatedAt"))
            )
        
        if meta.get("UpdatedAt"):
            doc.updation_time = frappe.utils.get_datetime(
                datetime.datetime.fromtimestamp(meta.get("UpdatedAt"))
            )
       
        doc.is_deleted = meta.get("IsDeleted", False)

        doc.save(ignore_permissions=True)
        frappe.db.commit()

        return [True, f"Campaign {campaign_id} updated successfully"]
            
    except Exception as e:
        # frappe.log_error(f"Verloop Campaign Update Error: {str(e)}", "Verloop Campaign Update")
        return [False, f"Error updating Verloop campaign: {str(e)}"]
    

@frappe.whitelist()
def enqueue_verloop_templates():
    frappe.enqueue(
        method='verloop.verloop.api.verloop_api.fetch_all_verloop_templates',
        queue='long',
        timeout=3600, 
        job_name='Sync Verloop Templates'
    )
    
    return [True, "Template sync job has been queued. Please check the Frappe Error Log for progress."]

def fetch_all_verloop_templates():
    try:
        if not frappe.db.exists("DocType", "Verloop Settings"):
            frappe.log_error("Verloop Settings doctype not found", "Verloop Template Sync")
            return

        settings_doc = frappe.get_doc("Verloop Settings")

        base_path = settings_doc.base_path
        client_id = settings_doc.client_id
        
        if not base_path or not client_id:       
            return [False, "Verloop Settings is not Configured Properly"]
            
        auth_key = settings_doc.get_password("api_key")
        
        if not auth_key:
            return [False, "API Key not configured properly"]
        
        limit = 100  
        
        # Tracking variables
        total_templates_imported = 0
        total_templates_skipped = 0
        count = 0
        total_count = None

        while True:
            # Calculate offset
            offset = count * limit

            # Prepare request payload
            payload = json.dumps({
                "ListOption": {
                    "limit": limit,
                    "offset": offset
                },
                "Type": 1  
            })

            headers = {
                'accept': "application/json",
                'Authorization': auth_key
            }
            
            url = f"https://{client_id}.verloop.io{base_path}/outreach/list-templates"
            parsed_url = urlparse(url)
            hostname = parsed_url.netloc
            endpoint = parsed_url.path

            conn = http.client.HTTPSConnection(hostname)
            conn.request("POST", endpoint, body=payload, headers=headers)
            response = conn.getresponse()   

            data = response.read()
            response_data = json.loads(data.decode("utf-8"))
            frappe.log_error(f"response data", response_data)

            result = create_template_records(response_data.get("Templates", []))
            frappe.log_error((result), "result")
            
            # Update tracking
            if result[0]: 
                # Extract numbers from result message
                imported = int(re.search(r'Imported (\d+)', result[1]).group(1))
                skipped = int(re.search(r'skipped (\d+)', result[1]).group(1))
                
                total_templates_imported += imported
                total_templates_skipped += skipped

            count += 1

            # Break conditions
            if (count * limit) >= total_count:
                break

        frappe.log_error(
            f"Verloop Template Sync Complete. "
            f"Total Templates: {total_count}, "
            f"Imported: {total_templates_imported}, "
            f"Skipped: {total_templates_skipped}",
            "Verloop Template Sync"
        )

    except Exception as e:
        frappe.log_error(f"Verloop Template Sync Error: {str(e)}", "Verloop Template Sync")

def create_template_records(filtered_templates):
    try:
        if not filtered_templates:
            return [True, "No new templates to import"]

        created_count = 0
        skipped_count = 0
        error_templates = []

        for template in filtered_templates:

            meta = template.get("Meta", {})
            template_id = meta.get("Id")

            if not template_id:
                error_templates.append({"name": template.get("Name", "Unknown"), "error": "Missing template ID"})
                continue

            if frappe.db.exists("Verloop Templates", {"template_id": template_id}):
                skipped_count += 1
                continue

            message_content = ""
            block = template.get("Block", {}).get("BlockType", {}).get("MessageBlock", {})
            leading_message = block.get("LeadingMessage", {}).get("MessageType", {})
            
            if "TextMessage" in leading_message:
                message_content = leading_message["TextMessage"]

            template_type = template.get("TemplateType", {}).get("WhatsAppTemplate", {})

            new_template = frappe.get_doc({
                "doctype": "Verloop Templates",
                "template_id": template_id,
                "template_name": template.get("Name", ""),
                "language_code": template_type.get("LanguageCode", ""),
                "message_content": message_content,
                "whatsapp_template_id": template_type.get("TemplateID", ""),
                "block_type": list(template.get("Block", {}).get("BlockType", {}).keys())[0] if template.get("Block", {}).get("BlockType") else "",
            })

            # Handle parameters
            parameters = template.get("Parameters", [])
            if parameters:
                for param in parameters:
                    new_template.append("parameters", {
                        "field_name": param
                    })

            action_parameters = template.get("ActionParameters", [])
            if action_parameters:
                for action_param in action_parameters:
                    new_template.append("action_parameter", {
                        "field_name": action_param
                    })

            new_template.save(ignore_permissions=True)
            created_count += 1

            # Handle timestamps
            if meta.get("CreatedAt"):
                new_template.creation_time = frappe.utils.get_datetime(
                    datetime.datetime.fromtimestamp(meta.get("CreatedAt"))
                )
            
            if meta.get("UpdatedAt"):
                new_template.updation_time = frappe.utils.get_datetime(
                    datetime.datetime.fromtimestamp(meta.get("UpdatedAt"))
                )
            
            new_template.save(ignore_permissions=True)

        frappe.db.commit()

        # Prepare result message
        result_message = f"Imported {created_count} templates, skipped {skipped_count}"

        if error_templates:
            result_message += f", errors in {len(error_templates)} templates"
        return [True, result_message]

    except Exception as e:
        # frappe.log_error(f"Critical Error: {str(e)}", "Verloop Template Import")
        return [False, f"Processing failed: {str(e)}"]
    

@frappe.whitelist()
def update_verloop_template(template_id):
    try:
        if not frappe.db.exists("DocType", "Verloop Settings"):
            return [False, "Verloop Settings doctype not found"]
            
        settings_doc = frappe.get_doc("Verloop Settings")
        
        base_path = settings_doc.base_path
        client_id = settings_doc.client_id
        
        if not base_path or not client_id:       
            return [False, "Verloop Settings is not Configured Properly"]
            
        auth_key = settings_doc.get_password("api_key")
        
        if not auth_key:
            return [False, "API Key not configured properly"]
        
        payload = json.dumps({
            "ID": template_id
        })
        
        headers = {
            'accept': "application/json",
            'Authorization': auth_key,
            'Content-Type': 'application/json'
        }
        
        url = f"https://{client_id}.verloop.io{base_path}/outreach/get-template"
        parsed_url = urlparse(url)
        hostname = parsed_url.netloc
        endpoint = parsed_url.path

        conn = http.client.HTTPSConnection(hostname)
        conn.request("POST", endpoint, body=payload, headers=headers)
        response = conn.getresponse()

        data = response.read()
        response_data = json.loads(data.decode("utf-8"))

        template_data = response_data.get("Template", {})

        template_exists = frappe.db.exists("Verloop Templates", template_id)

        if template_exists:
            doc = frappe.get_doc('Verloop Templates', template_id)
        else:
            doc = frappe.new_doc("Verloop Templates")
            doc.template_id = template_id
        
        doc.template_name = template_data.get('Name', '')

        if 'Block' in template_data and 'BlockType' in template_data['Block']:
            block_type_data = template_data['Block']['BlockType']
            if 'MessageBlock' in block_type_data:
                doc.block_type = 'MessageBlock'

                if 'LeadingMessage' in block_type_data['MessageBlock']:
                    leading_msg = block_type_data['MessageBlock']['LeadingMessage']
                    if 'MessageType' in leading_msg and 'TextMessage' in leading_msg['MessageType']:
                        doc.message_content = leading_msg['MessageType']['TextMessage']

        if 'TemplateType' in template_data:
            template_type_data = template_data['TemplateType']
            if 'WhatsAppTemplate' in template_type_data:
                whatsapp_data = template_type_data['WhatsAppTemplate']
                doc.whatsapp_template_id = whatsapp_data.get('TemplateID', '')
                doc.language_code = whatsapp_data.get('LanguageCode', '')
                doc.template_type = whatsapp_data.get('Type', 0)

        meta = template_data.get('Meta', {})

        if meta.get("Id"):
            doc.meta_id = meta.get("Id")

        if meta.get("CreatedAt"):
            doc.creation_time = frappe.utils.get_datetime(
                datetime.datetime.fromtimestamp(meta.get("CreatedAt"))
            )
    
        if meta.get("UpdatedAt"):
            doc.updation_time = frappe.utils.get_datetime(
                datetime.datetime.fromtimestamp(meta.get("UpdatedAt"))
            )
        
        doc.parameters = []
        doc.action_parameter = []
        
        for param in template_data.get('Parameters', []):
            doc.append('parameters', {
                'field_name': param
            })
        
        for action_param in template_data.get('ActionParameters', []):
            doc.append('action_parameter', {
                'field_name': action_param
            })

        if template_exists:
            frappe.log_error(f"Updating existing template {template_id}", "Verloop Template Update")
            doc.save(ignore_permissions=True)
        else:
            frappe.log_error(f"Inserting new template {template_id}", "Verloop Template Update")
            doc.insert(ignore_permissions=True)

        frappe.db.commit()
        
        return [True, f"Template {template_id} updated successfully"]
    
    except Exception as e:
        return [False, f"An error occurred: {str(e)}"]