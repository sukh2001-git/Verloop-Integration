// Copyright (c) 2025, sukhman@onehash.ai and contributors
// For license information, please see license.txt

frappe.ui.form.on("Verloop Templates", {
	refresh(frm) {

        frm.add_custom_button(__('Update Template'), function() {

            let template_id = frm.doc.template_id;
            console.log(template_id);
            
            if (!template_id) {
                frappe.msgprint({
                    title: __('Error'),
                    indicator: 'red',
                    message: __('No Template ID found')
                });
                return;
            }

            frappe.show_progress('Updating Template...', 50, 100, 'Fetching Template details');

            frappe.call({
                method: "verloop.verloop.api.verloop_api.update_verloop_template",
                args: {
                    template_id: template_id
                },
                callback: function(r) {

                    frappe.hide_progress("Updating Template");
                    
                    if(r.message[0] == true) {
                        frappe.msgprint({
                            title: __('Success'),
                            indicator: 'green',
                            message: __(r.message[1])
                        });
         
                        frm.reload_doc();
                    } else {
                        frappe.msgprint({
                            title: __('Failure'),
                            indicator: 'red',
                            message: __(r.message[1])
                        });
                    }
                },
                error: function() {
                    frappe.hide_progress("Updating Template");
                    frappe.msgprint({
                        title: __('Error'),
                        indicator: 'red',
                        message: __('An unexpected error occurred while updating the template')
                    });
                }
            });
        });
	},
});
