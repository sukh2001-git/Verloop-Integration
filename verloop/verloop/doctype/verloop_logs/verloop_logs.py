# Copyright (c) 2025, sukhman@onehash.ai and contributors
# For license information, please see license.txt

import frappe
import http.client
import re
import mimetypes
import json
from typing import Dict
from six import string_types

from frappe.model.document import Document


# Process template while saving them in Verloops Logs.
def process_template_parameter(campaign_id=None, template_parameter=None):
    frappe.log_error("temp", template_parameter)
    if isinstance(template_parameter, str):
        template_parameter = template_parameter.replace("'", '"')
        template_parameter = json.loads(template_parameter)
    elif isinstance(template_parameter, dict):
        template_parameter = template_parameter
        
    frappe.log_error("template_parameter", campaign_id)
    items = []

    if campaign_id:
        campaign_doc = frappe.get_doc("Verloop Campaigns", campaign_id)
        template_doc = frappe.get_doc("Verloop Templates", campaign_doc.template_id)

        for row in template_doc.parameters:
            temp = {}
            temp["field_name"] = row.get('field_name')
            temp["field_value"] = template_parameter.get(row.get('field_name'))
            items.append(temp)

    return items

# Process template while saving them in Verloops Logs.
def processTemplateActionParameter(campaign_id=None, templateActionParameter=None):
    if isinstance(templateActionParameter, str):
        templateActionParameter = templateActionParameter.replace("'", '"')
        templateActionParameter = json.loads(templateActionParameter)
    elif isinstance(templateActionParameter, dict):
        templateActionParameter = templateActionParameter
        
    items = []

    if campaign_id:
        campaign_doc = frappe.get_doc("Verloop Campaigns", campaign_id)
        template_doc = frappe.get_doc("Verloop Templates", campaign_doc.template_id)

        for row in template_doc.action_parameter:
            temp = {}
            temp["field_name"] = row.get('field_name')
            temp["field_value"] = templateActionParameter.get(f"{row.get('field_name')}")
            items.append(temp)

    return items
    

class VerloopLogs(Document):
    # Get Access token
	def get_access_token(self):
		return frappe.utils.password.get_decrypted_password(
			"Verloop Settings", "Verloop Settings", "api_key"
		)

	# Return number start with 91 to send whatsapp template correctly.
	def validate_and_normalize_number(self, number):
		cleaned_number = re.sub(r'\D', '', number)

		if len(cleaned_number) == 10 and cleaned_number[0] in '6789':
			return '91' + cleaned_number
		
		elif len(cleaned_number) == 11 and cleaned_number[0] == '0' and cleaned_number[1] in '6789':
			return '91' + cleaned_number[1:]
		
		elif len(cleaned_number) == 12 and cleaned_number.startswith('91') and cleaned_number[2] in '6789':
			return cleaned_number
		
		elif len(cleaned_number) == 13 and cleaned_number.startswith('+91') and cleaned_number[3] in '6789':
			return cleaned_number[1:]  

		return None
	
	# To prepare the payload:--
	def responseData(self, site_url):
		parameter = {}
		actionparameter = {}
		for value in self.parameters:
			parameter[value.get('field_name')] = value.get('field_value')
   
		for value in self.actionparameters:
			actionparameter[value.get('field_name')] = value.get('field_value')
   
		response_data = {
			"CampaignID": self.campaign_id,
			"To": {
				"PhoneNumber": self.to,
			},
			"Variables": {
				"customer_id": "my_customer_id",
				"customer_type": "vip",
			}
		}
		if site_url:
			response_data['Callback'] = {
				"URL": f"{site_url}api/method/verloop.verloop.doctype.verloop_logs.verloop_logs.update_message_status",
				"State": {
					"a":"b",
					"c":"d"
				}
			}
		if actionparameter:
			response_data['ActionParameters'] = actionparameter
		if parameter:
			response_data['Parameters'] = parameter

		return response_data

	# To send Whatsapp msg
	@frappe.whitelist()
	def send_message(self):
		if not self.to:
			frappe.throw("Recepient (`to`) is required to send message.")
		access_token = self.get_access_token()
		client_id = frappe.db.get_single_value("Verloop Settings", "client_id")
		site_url = frappe.db.get_single_value("Verloop Settings", "site_url")
		try:
			conn = http.client.HTTPSConnection(f"{client_id}.verloop.io")
			payload = self.responseData(site_url)
			payload = json.dumps(payload)
			frappe.log_error("payload", payload)
			headers = {
				'accept': 'application/json',
				'Content-Type': 'application/json',
				'Authorization': access_token
			}
			conn.request("POST", "/api/v2/outreach/send-message", payload, headers)
			res = conn.getresponse()
			data = res.read()
			resData = json.loads(data.decode("utf-8"))
			self.message_id_request = resData.get("MessageID")
			self.save(ignore_permissions = 1)
		except Exception as e:
			frappe.log_error("Failed to Send Verloop Campaign", str(e))
	
	@classmethod
	def send_whatsapp_message(self, receiver_list, message, campaign_id, doctype, docname, template_parameter = None, templateActionParameter = None):
		if isinstance(receiver_list, string_types):
			if not isinstance(receiver_list, list):
				receiver_list = [receiver_list]
		frappe.log_error("receiver_list", receiver_list)
		for rec in receiver_list:
			"""
			Iterate receiver_list and send message to each recepient
			"""
			frappe.log_error("actionverparameter", templateActionParameter)
			to = self.validate_and_normalize_number(self, rec)
			self.create_whatsapp_message(to, message, campaign_id, doctype, docname, template_parameter, templateActionParameter) #For Text Message or Caption for documents

 
	# Create WhatsApp Message 
	def create_whatsapp_message(to, message, campaign_id=None, doctype=None, docname=None, template_parameter = None, templateActionParameter = None):
		"""
		Create Verloop Logs with given data.
		"""
		parameters = process_template_parameter(campaign_id, template_parameter)
		frappe.log_error("parameters", parameters)
		actionparameters = processTemplateActionParameter(campaign_id, templateActionParameter)
		frappe.log_error("actionparameters", actionparameters)
		vp_logs = frappe.get_doc({
			"doctype": "Verloop Logs",
			"to": to,
			"reference_dt": doctype,
			"reference_name": docname,
			"campaign_id": campaign_id,
			"parameters": parameters,
			"actionparameters": actionparameters,
			"message" : message
		})
		vp_logs.save(ignore_permissions = 1)
		vp_logs.send_message()

@frappe.whitelist()
def update_message_status(**args):
	''' Method to updtae status of Message '''
	frappe.log_error("update_message_status", args)
	message_id = args.get("MessageID")
	status = args.get("Status")
	# failure_reason = args.get("failure_reason")

	if frappe.db.exists('Verloop Logs', {"message_id": message_id}):
		frappe.db.set_value(
			"Verloop Logs", {"message_id": message_id}, "status", status.title()
		)
		frappe.db.commit()
  
@frappe.whitelist()
def capture_consent(**args):
    '''Method to capture consent'''
    frappe.log_error("capture_consent", args)