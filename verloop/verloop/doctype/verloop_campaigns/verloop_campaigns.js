// Copyright (c) 2025, sukhman@onehash.ai and contributors
// For license information, please see license.txt

frappe.ui.form.on("Verloop Campaigns", {
	refresh(frm) {

        frm.add_custom_button(__('Update Campaign'), function() {

            let campaign_id = frm.doc.campaign_id;
            console.log(campaign_id);
            
            if (!campaign_id) {
                frappe.msgprint({
                    title: __('Error'),
                    indicator: 'red',
                    message: __('No Campaign ID found')
                });
                return;
            }

            frappe.show_progress('Updating Campaign...', 50, 100, 'Fetching campaign details');

            frappe.call({
                method: "verloop.verloop.api.verloop_api.update_verloop_campaign",
                args: {
                    campaign_id: campaign_id
                },
                callback: function(r) {

                    frappe.hide_progress("Updating Campaign");
                    
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
                    frappe.hide_progress("Updating Campaign");
                    frappe.msgprint({
                        title: __('Error'),
                        indicator: 'red',
                        message: __('An unexpected error occurred while updating the campaign')
                    });
                }
            });
        });
	},
});