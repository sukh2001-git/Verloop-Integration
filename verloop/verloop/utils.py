import frappe
from frappe import _
import urllib
from frappe.email.doctype.notification.notification import Notification, get_context, json
from verloop.verloop.doctype.verloop_logs.verloop_logs import VerloopLogs
from frappe.utils.print_format import download_pdf
# from frappe_meta_integration.whatsapp.pdf_utils import *

# Get Access token
def get_access_token(self):
    return frappe.utils.password.get_decrypted_password(
        "Verloop Settings", "Verloop Settings", "api_key"
    )
    
# Check Whether WhatsApp number is correct or not
@frappe.whitelist()
def validate_whatsapp_number(whatsapp_number):
	'''
		Validate Phone Number with Special Characters.
	'''
	special_chars = string.punctuation 
	bools = list(map(lambda char: char in special_chars, whatsapp_number))
	if any(bools):
		frappe.throw(
	        _("Whatsapp Number {0} is Invalid, Special Characters are not allowed.").format(frappe.bold(whatsapp_number))
        )
	if ' ' in whatsapp_number:
		frappe.throw(
	        _("Whatsapp Number {0} is Invalid, Spaces are not allowed.").format(frappe.bold(whatsapp_number))
        )


@frappe.whitelist()
def send_verloop_msg(doctype, docname, args, template_parameter = None, action_parameter = None):
	
	if args and isinstance(args, str):
		args = json.loads(args)
	#Setting argumnents is exist
	
	message = args['message'] if 'message' in args else "No message Found"
	campaign_id = args['verloop_campaign_id']
	#Setting recipients list
	recipients = (args['recipients']).replace(" ", "")
	last_char = recipients[-1]
	if last_char == ',':
		receiver_list = recipients[0: -1].split(',')
	else:
		receiver_list = recipients
	
	template_in_json = json.loads(template_parameter)
	actionparameter = json.loads(action_parameter)
 
	# template = frappe.get_doc("Verloops Templates", template)

	VerloopLogs.send_whatsapp_message(
		receiver_list = receiver_list,
		message = message,
		campaign_id = campaign_id,
		doctype = doctype,
		docname = docname,
		template_parameter = template_in_json,
		actionparameter = actionparameter
	)
