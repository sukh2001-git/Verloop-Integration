frappe.listview_settings["Verloop Templates"] = {
    onload: function(listview) {
        listview.page.add_inner_button("Fetch Templates", function() {
            frappe.call({
                method: "verloop.verloop.api.verloop_api.enqueue_verloop_templates",
                callback: function(r) {
                    
                    if(r.message[0] == true) {
                        frappe.msgprint({
                            title: __('Sync Queued'),
                            indicator: 'green',
                            message: __(r.message[1])
                        });

                        frappe.ui.toolbar.clear_cache();
                        
                    } else {
                        frappe.msgprint({
                            title: __('Sync Failed'),
                            indicator: 'red',
                            message: __(r.message[1] || 'Unable to queue template sync')
                        });
                    }

                    listview.refresh();
                },
                error: function() {
                    frappe.hide_progress("Verloop Templates Sync");
                    frappe.msgprint({
                        title: __('Error'),
                        indicator: 'red',
                        message: __('An unexpected error occurred while queuing template sync')
                    });
                }
            });
        });
    }
};