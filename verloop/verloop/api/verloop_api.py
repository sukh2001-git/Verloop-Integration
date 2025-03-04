from __future__ import unicode_literals
from urllib.parse import urlparse

import frappe
from frappe import _
import http.client
import json, re
import string

@frappe.whitelist()
def get_verloop_campaigns():
    try:
        settings = frappe.get_all("Verloop Settings")
        if not settings:
            return [False, "Verloop Settings not found"]
            
        settings_doc = frappe.get_doc("Verloop Settings", settings[0]["name"])
        
        # Get required fields from settings
        base_path = settings_doc.base_path
        client_id = settings_doc.client_id
        
        if not base_path or not client_id:
            return [False, "Verloop Settings is not Configured Properly"]
            
        # Get decrypted API key
        auth_key = frappe.utils.password.get_decrypted_password(
            "Verloop Settings",
            settings[0]["name"],
            "api_key"
        )
        
        if not auth_key:
            return [False, "API Key not configured properly"]
        
        campaign_type = getattr(settings_doc, "campaign_type", 1)
        campaign_limit = getattr(settings_doc, "campaign_limit", 100)
        campaign_offset = getattr(settings_doc, "campaign_offset", 0)
            
        headers = {
            'accept': "application/json",
            'Authorization': auth_key
        }
        
        url = f"https://{client_id}.verloop.io{base_path}/outreach/list-campaigns"
        
        # Parse the URL for the connection
        parsed_url = urlparse(url)
        hostname = parsed_url.netloc
        endpoint = parsed_url.path

        payload = json.dumps({
            "ListOption": {
                "limit": campaign_limit,
                "offset": campaign_offset
            },
            "Type": campaign_type
        })
        
        # Make the HTTPS request
        conn = http.client.HTTPSConnection(hostname)
        conn.request("POST", endpoint, body=payload, headers=headers)
        response = conn.getresponse()

        data = response.read()
        response_data = json.loads(data.decode("utf-8"))
        

        # if 'create_template_records' in globals():
        result = create_template_records(response_data)
        return result
        # else:
        #     return [True, response_data]
            
    except Exception as e:
        frappe.log_error(f"Verloop API Error: {str(e)}", "Verloop Campaign Fetch Error")
        return [False, f"Error fetching Verloop campaigns: {str(e)}"]