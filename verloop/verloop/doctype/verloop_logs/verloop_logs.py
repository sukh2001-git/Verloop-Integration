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
def process_template_parameter(template = None, template_parameter = None):
	if isinstance(template_parameter, str):
		template_parameter = json.loads(template_parameter)
	elif isinstance(template_parameter, dict):
		template_parameter = template_parameter
	items = []
	if template:
		template_doc = frappe.get_doc("Verloop Templates", template)
		for row in template_doc.parameter:
			temp = {}
			temp["field_name"] = row.get("field_name")
			temp["field_value"] = row.get("field_value")
			items.append(temp)
	return items

# Process template while saving them in Verloops Logs.
def process_template_actionParameter(template = None, template_actionParameter = None):
	if isinstance(template_parameter, str):
		template_parameter = json.loads(template_parameter)
	elif isinstance(template_parameter, dict):
		template_parameter = template_parameter
	items = []
	if template:
		template_doc = frappe.get_doc("Verloop Templates", template)
		for row in template_doc.actionparameters:
			temp = {}
			temp["field_name"] = row.get("field_name")
			temp["field_value"] = row.get("field_value")
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
	def responseData():
		parameter = {}
		actionparameter = {}
		for value in self.parameters:
			parameter[value.get('field_name')] = value.get('field_value')
   
		for value in self.actionparameters:
			actionparameter[value.get('field_name')] = value.get('field_value')
   
		response_data = {
			"CampaignID": CampaignID,
			"To": {
				"PhoneNumber": PhoneNumber,
			},
			"Variables": {
				"customer_id": "my_customer_id",
				"customer_type": "vip",
			},
			"Callback": {
				"URL": "https://stagenerivio.onehash.ltd",
				"State": {
					"a":"b",
					"c":"d"
				}
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
		base_path = frappe.db.get_single_value("Verloop Settings", "base_path")
		client_id = frappe.db.get_single_value("Verloop Settings", "client_id")
		try:
			conn = http.client.HTTPSConnection(f"{base_path}.verloop.io")
			payload = json.dumps(self.responseData())
			headers = {
				'accept': 'application/json',
				'Content-Type': 'application/json',
				'Authorization': access_token
			}
			conn.request("POST", "/api/v2/outreach/SendMesage", payload, headers)
			res = conn.getresponse()
			data = res.read()
			resData = data.decode("utf-8")
			frappe.log_error("resData", resData)
		except Exception as e:
			frappe.log_error("Failed to Send Verloop Campaign", str(e))
	
	@classmethod
	def send_whatsapp_message(self, receiver_list, message, template, doctype, docname, template_parameter = None, template_actionParameter = None):
		if isinstance(receiver_list, string_types):
			if not isinstance(receiver_list, list):
				receiver_list = [receiver_list]
		frappe.log_error("receiver_list", receiver_list)
		for rec in receiver_list:
			"""
			Iterate receiver_list and send message to each recepient
			"""
			to = self.validate_and_normalize_number(self, rec)
			self.create_whatsapp_message(to, message, template, doctype, docname, template_parameter, template_actionParameter) #For Text Message or Caption for documents
			if media and file_name:
				self.create_whatsapp_message(to, message, template, doctype, docname, template_parameter, template_actionParameter) #For Document

 
	# Create WhatsApp Message 
	def create_whatsapp_message(to, message, template=None, doctype=None, docname=None, template_parameter = None, template_actionParameter = None):
		"""
		Create Verloop Logs with given data.
		"""
		parameters = process_template_parameter(template, template_parameter)
		actionparameters = process_template_actionParameter(template, template_actionParameter)
		vp_logs = frappe.get_doc({
			"doctype": "Verloop Logs",
			"to": to,
			"reference_dt": doctype,
			"reference_name": reference_name,
			"campaign_id": campaign_id,
			"template_id": template_id,
			"parameters": parameters,
			"actionparameters": actionparameters,
			"message" : message
		})
		vp_logs.save(ignore_permissions = 1)
		vp_logs.send_message()

@frappe.whitelist()
def update_message_status(**args):
	''' Method to updtae status of Message '''
	frappe.log_error("status", args)
	# message_id = args.get("request_id")
	# status = args.get("status")
	# failure_reason = args.get("failure_reason")

	# if frappe.db.exists('Verloop Logs', {"message_id": message_id}):
	# 	frappe.db.set_value(
	# 		"Verloop Logs", {"message_id": message_id}, "status", status.title()
	# 	)
	# 	frappe.db.commit()