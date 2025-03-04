frappe.listview_settings["Verloop Campaigns"] = {
    onload: function(listview) {
        console.log("i am here")
        listview.page.add_inner_button("Fetch Campaigns", function() {
            console.log("i am heree")
            frappe.show_progress('Fetching Verloop Campaigns...', 70, 100, 'Please wait');
            frappe.call({
                method: "verloop.verloop.api.verloop_api.get_verloop_campaigns",
                callback: function(r) {
                    frappe.hide_progress("Fetching Verloop Campaigns...")
                    
                    if(r.message[0] == true) {
                        frappe.msgprint({
                            title: __('Success'),
                            indicator: 'green',
                            message: __(r.message[1])
                        });
                        
                        listview.refresh();
                        frappe.ui.toolbar.clear_cache()
                        
                    } else if(r.message[0] == false) {
                        frappe.msgprint({
                            title: __('Failure'),
                            indicator: 'red',
                            message: __(r.message[1])
                        });
                    }
                }
            })
        })
    }
};