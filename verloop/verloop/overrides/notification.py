import frappe
from frappe import _
import urllib
from frappe.email.doctype.notification.notification import Notification, get_context, json
from verloop.verloop.doctype.verloop_logs.verloop_logs import VerloopLogs


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
				self.send_verloop_msg(doc, context)
		except:
			frappe.log_error(title='Failed to send notification', message=frappe.get_traceback())

		super(SendNotification, self).send(doc)

	def send_verloop_msg(self, doc, context):
		verloop_campaigns = self.verloop_campaigns
		if not verloop_campaigns:
			return
		campaign_id = frappe.get_doc("Verloop Campaigns", verloop_campaigns)
		verloop_templates = frappe.get_doc("Verloop Templates", campaign_id.template_id)
		parameters = self.message
		if parameters and isinstance(parameters, str):
			parameters = json.loads(parameters)
		
		template_parameter = frappe.render_template(f'{parameters.get("parameters")}', context)
		templateActionParameter = frappe.render_template(f'{parameters.get("action_parameters")}', context)
		VerloopLogs.send_whatsapp_message(
			receiver_list= self.get_receiver_list(doc, context),
			message= verloop_templates.message_content,
			campaign_id = campaign_id.name,
			doctype = doc.doctype,
			docname = doc.name,
			template_parameter = template_parameter,
			templateActionParameter = templateActionParameter
		)
