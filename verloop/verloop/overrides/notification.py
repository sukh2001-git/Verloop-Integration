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
			if self.channel == 'Verloop Campaign':
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
  
		VerloopLogs.send_whatsapp_message(
			receiver_list=self.get_receiver_list(doc, context),
			message=frappe.render_template(self.message, context),
			campaign_id = campaign_id,
			doctype = self.doctype,
			docname = self.name,
			template_parameter = params,
			actionparameter = action_parameter
		)
