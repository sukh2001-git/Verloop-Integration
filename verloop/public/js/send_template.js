frappe.provide("verloop.ui.components");

verloop.ui.components.TemplateSender = class TemplateSender {
    constructor(opts) {
        // Default options
        this.options = {
            doctype: null,        // Current doctype
            docname: null,        // Current document name
            button_label: __('Send Template'),
            menu_location: "Actions", // Where to place in the menu
            send_method: "frappe.email.doctype.email_template.email_template.send_template", // Server method
            callback: null        // Optional callback after sending
        };
        
        // Override defaults with provided options
        Object.assign(this.options, opts || {});
        
        // Validate required options
        if (!this.options.doctype || !this.options.docname) {
            frappe.throw(__("Doctype and docname are required for Template Sender"));
        }
    }
    
    // Add button to form
    add_button_to_form(frm) {
        console.log("Adding button to form");
        if (!frm.is_new()) {
            frm.page.add_menu_item(
                this.options.button_label, 
                () => this.open_dialog(),
                this.options.menu_location
            );
        }
    }
    
    // Open the dialog
    open_dialog() {
        let me = this;
        let d = new frappe.ui.Dialog({
            title: __("Send Template"),
            fields: [
                {
                    label: __("To"),
                    fieldname: "moblile_no",
                    fieldtype: "data",
                    default: frm.doc.mobile_no,
                    reqd: 1
                },
                {
                    label: __("Template"),
                    fieldname: "template",
                    fieldtype: "Link",
                    options: "Email Template",
                    reqd: 1,
                    onchange: function() {
                        let template_name = d.get_value("template");
                        if (template_name) {
                            frappe.call({
                                method: "frappe.client.get",
                                args: {
                                    doctype: "Email Template",
                                    name: template_name
                                },
                                callback: function(r) {
                                    if (r.message) {
                                        d.set_value("template_content", r.message.response || r.message.template_content);
                                    }
                                }
                            });
                        }
                    }
                },
                {
                    label: __("Template Content"),
                    fieldname: "template_content",
                    fieldtype: "html",
                    read_only: 1
                },
                {
                    label: __("Dynamic Parameters"),
                    fieldname: "dynamic_params",
                    fieldtype: "Data",
                    description: __("Enter dynamic values for placeholders")
                }
            ],
            primary_action_label: __("Send"),
            primary_action(values) {
                frappe.call({
                    method: me.options.send_method,
                    args: {
                        doctype: me.options.doctype,
                        docname: me.options.docname,
                        to_user: values.to_user,
                        template: values.template,
                        dynamic_params: values.dynamic_params
                    },
                    callback: function(response) {
                        frappe.msgprint(__("Template Sent Successfully"));
                        if (typeof me.options.callback === "function") {
                            me.options.callback(response);
                        }
                    }
                });
                d.hide();
            },
            secondary_action_label: __("Discard"),
            secondary_action() {
                d.hide();
            }
        });

        d.show();
    }
};

// Helper function for easy instantiation and setup
frappe.ui.setup_template_sender = function(frm, opts = {}) {
    opts.doctype = frm.doctype;
    opts.docname = frm.docname;
    
    // Create instance
    let template_sender = new verloop.ui.components.TemplateSender(opts);
    
    // Add button to form
    template_sender.add_button_to_form(frm);
    
    return template_sender;
};

frappe.ui.form.on("Lead", {
    refresh(frm) {
        frappe.ui.setup_template_sender(frm);
        console.log("Template sender button added");
    }
});
