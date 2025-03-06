import frappe
from frappe import _
import urllib
from frappe.email.doctype.notification.notification import Notification, get_context, json
# from frappe_meta_integration.whatsapp.doctype.whatsapp_communication.whatsapp_communication import WhatsAppCommunication
from frappe.utils.print_format import download_pdf
from frappe_meta_integration.whatsapp.pdf_utils import *

class SendNotification(Notification):
	def send(self, doc):
		"""
		Overrided current send method
		"""
		context = get_context(doc)
		context = {"doc": doc, "alert": self, "comments": None}
		if doc.get("_comments"):
			context["comments"] = json.loads(doc.get("_comments"))

		if self.is_standard:
			self.load_standard_properties(context)

		try:
			if self.channel == 'WhatsApp':
				frappe.log_error("channel", [doc, context])
				self.send_whatsapp_msg(doc, context)
		except:
			frappe.log_error(title='Failed to send notification', message=frappe.get_traceback())

		super(SendNotification, self).send(doc)

	def send_whatsapp_msg(self, doc, context):
		whatsapp_template = self.whatsapp_template
		if not whatsapp_template:
			return
		whatsapp_template = frappe.get_doc("Verloop Templates", whatsapp_template)
		template_parameters = frappe.render_template(self.message, context)
		params = json.loads(template_parameters)
		frappe.log_error("hi", [params, whatsapp_template])
  
		"""
		Generate mediaif exists and send message
		"""
		pdf_link = None
		file_name = None
		
		url = ""
		if "https" in params.get("header_1"):
				url = params.get("header_1")
				frappe.log_error("if url", url)
		else:
			url = f'{frappe.utils.get_url()}{urllib.parse.quote(params.get("header_1"))}'
			if "https" in url:
				pass
			else:
				domain = frappe.conf.get('domains')
				if len(domain)>0:
					url = f"https://{domain[0]}{urllib.parse.quote(params.get('header_1'))}"
					
			frappe.log_error("if else", url)
		WhatsAppCommunication.send_whatsapp_message(
			receiver_list=self.get_receiver_list(doc, context),
			message=frappe.render_template(self.message, context),
			template = whatsapp_template.name,
			doctype = self.doctype,
			docname = self.name,
			template_parameter = params,
			media = pdf_link,
			file_name = file_name,
			header_media = url if whatsapp_template.get("header_has_media") else None
		)
