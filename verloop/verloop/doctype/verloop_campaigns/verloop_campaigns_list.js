frappe.listview_settings["Verloop Campaigns"] = {
    onload: function(listview) {
        console.log("Adding button to fetch campaigns");
        listview.page.add_inner_button("Fetch Campaigns", function() {

            frappe.call({
                method: "verloop.verloop.api.verloop_api.enqueue_verloop_campaigns",
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
                            message: __(r.message[1] || 'Unable to queue campaign sync')
                        });
                    }

                    listview.refresh();
                },
                error: function() {
                    frappe.msgprint({
                        title: __('Error'),
                        indicator: 'red',
                        message: __('An unexpected error occurred while queuing campaign sync')
                    });
                }
            });
        });
    }
};

