frappe.provide("verloop.ui.components");

verloop.ui.components.TemplateSender = class TemplateSender {
  constructor(opts) {
    this.options = {
      doctype: null, // Current doctype
      docname: null, // Current document name
      button_label: __("Send Template"),
      menu_location: "Actions",
      send_method:
        "verloop.verloop.utils.send_verloop_msg",
      callback: null,
    };

    Object.assign(this.options, opts || {});

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
        () => this.open_dialog(frm),
        this.options.menu_location
      );
    }
  }

  // Open the dialog
  open_dialog(frm) {
    let me = this;
    let docname = this.options.docname || frm.docname;

    // Find all potential phone number fields in the current doctype
    let phoneFields = this.getPhoneNumberFields(frm);

    // Prepare default phone numbers
    let defaultNumbers = [];
    phoneFields.forEach((field) => {
      if (frm.doc[field] && frm.doc[field].trim && frm.doc[field].trim()) {
        defaultNumbers.push(frm.doc[field]);
      }
    });

    // Create initial fields array for the dialog
    let dialogFields = [
      {
        label: __("To"),
        fieldname: "mobile_no",
        fieldtype: "MultiSelect",
        options: defaultNumbers.join("\n"),
        description: __("Select or enter phone numbers"),
        reqd: 1,
      },
      {
        label: __("Campaign"),
        fieldname: "campaign",
        fieldtype: "Link",
        options: "Verloop Campaigns",
        reqd: 1,
        get_query: function () {
          return {
            filters: [["Verloop Campaigns", "is_deleted", "!=", 1]],
          };
        },
        format_for_input: function (value, doc) {
          if (doc && doc.campaign_name) {
            return doc.campaign_name;
          }
          return value;
        },
      },
      {
        label: __("Campaign Name"),
        fieldname: "campaign_name",
        fieldtype: "Small Text",
        read_only: 1,
      },
      {
        label: __("Message Content"),
        fieldname: "message_content",
        fieldtype: "Small Text",
        read_only: 1,
        hidden: 1,
      },
    ];

    let d = new frappe.ui.Dialog({
      title: __("Send Template"),
      fields: dialogFields,
      primary_action_label: __("Send"),
      primary_action(values) {
        // Collect all parameter values
        let parameters = {};
        let action_parameters = {};

        // Collect regular parameters
        Object.keys(values).forEach((key) => {
          if (key.startsWith("param_")) {
            let param_name = key.replace("param_", "");
            parameters[param_name] = values[key];
          }
          if (key.startsWith("action_param_")) {
            let param_name = key.replace("action_param_", "");
            action_parameters[param_name] = values[key];
          }
        });

        frappe.call({
          method: me.options.send_method,
          args: {
            doctype: me.options.doctype,
            docname: me.options.docname,
            to_user: values.mobile_no,
            campaign: values.campaign,
            campaign_name: values.campaign_name,
            parameters: parameters,
            action_parameters: action_parameters,
          },
          callback: function (response) {
            frappe.msgprint(__("Template Sent Successfully"));
            if (typeof me.options.callback === "function") {
              me.options.callback(response);
            }
          },
        });
        d.hide();
      },
      secondary_action_label: __("Discard"),
      secondary_action() {
        d.hide();
      },
    });

    // Handle campaign change
    d.fields_dict.campaign.df.onchange = function() {
      let campaign_id = this.get_value();
      if (campaign_id) {
        // Show loading indicator
        d.set_title(__(`Send Template: Loading...`));

        // In Verloop Campaigns, name field is campaign_id
        frappe.call({
          method: "frappe.client.get",
          args: {
            doctype: "Verloop Campaigns",
            name: campaign_id,
          },
          callback: function (r) {
            if (r.message) {
              let campaign_name = r.message.campaign_name;
              let template_id = r.message.template_id;

              // Update dialog title to show which campaign was selected
              d.set_title(
                __(`Send Template: ${campaign_name || campaign_id}`)
              );

              // Set campaign name field
              d.set_value("campaign_name", campaign_name);

              if (template_id) {
                // If template_id is directly available in campaign
                frappe.call({
                  method: "frappe.client.get",
                  args: {
                    doctype: "Verloop Templates",
                    name: template_id,
                    fields: [
                      "name",
                      "template_id",
                      "message_content",
                      "parameters",
                      "action_parameter",
                    ],
                  },
                  callback: function (t) {
                    if (t.message) {
                      // Set template content
                      d.set_value(
                        "message_content",
                        t.message.message_content
                      );
                      d.fields_dict.message_content.df.hidden = false;
                      d.fields_dict.message_content.refresh();

                      // Clear existing parameter fields
                      me.clearDynamicFields(d);

                      // Add parameter fields dynamically
                      me.addParameterFields(d, t.message.parameters, frm);

                      // Add action parameter fields
                      me.addActionParameterFields(
                        d,
                        t.message.action_parameter,
                        frm
                      );
                      d.refresh();
                    }
                  },
                });
              } else {
                // No template_id in campaign, search by campaign_id
                frappe.call({
                  method: "frappe.client.get_list",
                  args: {
                    doctype: "Verloop Templates",
                    filters: {
                      campaign_id: campaign_id, // Note: changed from template_id to campaign_id
                    },
                    fields: ["name", "template_id", "message_content"],
                  },
                  callback: function (t) {
                    if (t.message && t.message.length > 0) {
                      let template_name = t.message[0].name;

                      // Fetch complete template to get all fields
                      frappe.call({
                        method: "frappe.client.get",
                        args: {
                          doctype: "Verloop Templates",
                          name: template_name,
                          fields: [
                            "name",
                            "template_id",
                            "message_content",
                            "parameters",
                            "action_parameter",
                          ],
                        },
                        callback: function (tr) {
                          if (tr.message) {
                            // Set template content
                            d.set_value(
                              "message_content",
                              tr.message.message_content
                            );
                            d.fields_dict.message_content.df.hidden = false;
                            d.fields_dict.message_content.refresh();

                            // Clear existing parameter fields
                            me.clearDynamicFields(d);

                            // Add parameter fields dynamically
                            me.addParameterFields(
                              d,
                              tr.message.parameters,
                              frm
                            );

                            // Add action parameter fields
                            me.addActionParameterFields(
                              d,
                              tr.message.action_parameter,
                              frm
                            );
                            d.refresh();
                          }
                        },
                      });
                    } else {
                      frappe.msgprint(
                        __("No template found for this campaign")
                      );
                    }
                  },
                });
              }
            }
          },
        });
      }
    };

    d.show();
  }

  // Get all potential phone number fields from the doctype
  getPhoneNumberFields(frm) {
    let phoneFields = [];
    const possiblePhoneFieldNames = [
      "mobile_no",
      "phone",
      "phone_no",
      "contact",
      "contact_no",
      "cell",
      "cell_no",
      "whatsapp",
      "whatsapp_no",
      "alternate_number",
      "telephone",
      "tel",
      "mobile",
      "phone_number",
      "contact_number",
    ];

    // Check if any of these fields exist in the current doctype
    if (frappe.get_meta(frm.doctype)) {
      frappe.get_meta(frm.doctype).fields.forEach((df) => {
        if (
          possiblePhoneFieldNames.includes(df.fieldname) ||
          (df.fieldname && df.fieldname.toLowerCase().includes("phone")) ||
          (df.fieldname && df.fieldname.toLowerCase().includes("mobile")) ||
          (df.fieldname && df.fieldname.toLowerCase().includes("contact")) ||
          (df.fieldname && df.fieldname.toLowerCase().includes("whatsapp"))
        ) {
          phoneFields.push(df.fieldname);
        }
      });
    }

    return phoneFields;
  }

  // Clear dynamic fields
  clearDynamicFields(dialog) {
    // Remove all dynamic fields
    if (!dialog.fields_dict) return;
    
    let fieldsToRemove = [];
    Object.keys(dialog.fields_dict).forEach((field) => {
      if (
        field.startsWith("param_") ||
        field.startsWith("action_param_") ||
        field === "param_section_break" ||
        field === "action_section_break"
      ) {
        fieldsToRemove.push(field);
      }
    });

    // Mark fields for removal
    fieldsToRemove.forEach((field) => {
      if (dialog.fields_dict[field]) {
        dialog.fields_dict[field].df.hidden = true;
        dialog.fields_dict[field].$wrapper.hide();
      }
    });
  }

  // Add parameter fields dynamically
  addParameterFields(dialog, parameters, frm) {
    // Check if parameters exist - handle all possible formats
    let paramList = this.parseTableField(parameters);
    if (!paramList || !paramList.length) return;

    // Get populated fields (excluding lead_name, including email)
    let populatedFields = this.getPopulatedFields(frm, 10, ["lead_name"]);
    if (populatedFields.length === 0) return;

    // Add a section break for parameters
    let sectionExists = dialog.fields_dict["param_section_break"] !== undefined;
    
    if (!sectionExists) {
      // Create a new field definition
      let sectionField = {
        fieldtype: "Section Break",
        fieldname: "param_section_break",
        label: __("Template Parameters")
      };
      
      // Add to dialog's fields array
      dialog.fields.push(sectionField);
      
      // Recreate the field in the dialog
      let field = frappe.ui.form.make_control({
        df: sectionField,
        parent: dialog.body,
        render_input: true
      });
      
      dialog.fields_dict["param_section_break"] = field;
    } else {
      dialog.fields_dict["param_section_break"].df.hidden = false;
      dialog.fields_dict["param_section_break"].$wrapper.show();
    }

    // Add fields for each parameter
    paramList.forEach((param, index) => {
      // Use standardized label format
      let labelName = `Parameter ${index + 1}`;
      let paramName = param.parameter_name || param.name || param.field_name || `param_${index + 1}`;
      let fieldName = `param_${paramName}`;

      // Check if field already exists
      if (!dialog.fields_dict[fieldName]) {
        // Create field definition with searchable autocomplete
        let fieldDef = {
          label: __(labelName),
          fieldname: fieldName,
          fieldtype: "Autocomplete",
          description: __("Select value for ") + labelName
        };
        
        // Add options from actual field values
        fieldDef.options = populatedFields.map(f => {
          return {
            label: `${f.label}: ${String(frm.doc[f.fieldname] || '')}`,
            value: String(frm.doc[f.fieldname] || '')
          };
        });
        
        // Add to dialog's fields array
        dialog.fields.push(fieldDef);
        
        // Create the control
        let field = frappe.ui.form.make_control({
          df: fieldDef,
          parent: dialog.body,
          render_input: true
        });
        
        field.refresh();
        dialog.fields_dict[fieldName] = field;
      } else {
        // Show existing field
        dialog.fields_dict[fieldName].df.hidden = false;
        dialog.fields_dict[fieldName].$wrapper.show();
        dialog.fields_dict[fieldName].df.label = __(labelName);
        
        // Update options with current field values
        dialog.fields_dict[fieldName].df.options = populatedFields.map(f => {
          return {
            label: `${f.label}: ${String(frm.doc[f.fieldname] || '')}`,
            value: String(frm.doc[f.fieldname] || '')
          };
        });
        
        dialog.fields_dict[fieldName].refresh();
      }
    });
  }

  // Add action parameter fields
  addActionParameterFields(dialog, action_parameters, frm) {
    // Check if action parameters exist - handle all possible formats
    let actionParamList = this.parseTableField(action_parameters);
    if (!actionParamList || !actionParamList.length) return;

    // Get populated fields (excluding lead_name, including email)
    let populatedFields = this.getPopulatedFields(frm, 10, ["lead_name"]);
    if (populatedFields.length === 0) return;

    // Add a section break for action parameters
    let sectionExists = dialog.fields_dict["action_section_break"] !== undefined;
    
    if (!sectionExists) {
      // Create a new field definition
      let sectionField = {
        fieldtype: "Section Break",
        fieldname: "action_section_break",
        label: __("Action Parameters")
      };
      
      // Add to dialog's fields array
      dialog.fields.push(sectionField);
      
      // Recreate the field in the dialog
      let field = frappe.ui.form.make_control({
        df: sectionField,
        parent: dialog.body,
        render_input: true
      });
      
      dialog.fields_dict["action_section_break"] = field;
    } else {
      dialog.fields_dict["action_section_break"].df.hidden = false;
      dialog.fields_dict["action_section_break"].$wrapper.show();
    }

    // Add fields for each action parameter
    actionParamList.forEach((param, index) => {
      // Use standardized label format
      let labelName = `Action Parameter ${index + 1}`;
      let paramName = param.parameter_name || param.name || param.field_name || `action_param_${index + 1}`;
      let fieldName = `action_param_${paramName}`;

      // Check if field already exists
      if (!dialog.fields_dict[fieldName]) {
        // Create field definition with searchable autocomplete
        let fieldDef = {
          label: __(labelName),
          fieldname: fieldName,
          fieldtype: "Autocomplete",
          description: __("Select value for ") + labelName
        };
        
        // Add options from actual field values
        fieldDef.options = populatedFields.map(f => {
          return {
            label: `${f.label}: ${String(frm.doc[f.fieldname] || '')}`,
            value: String(frm.doc[f.fieldname] || '')
          };
        });
        
        // Add to dialog's fields array
        dialog.fields.push(fieldDef);
        
        // Create the control
        let field = frappe.ui.form.make_control({
          df: fieldDef,
          parent: dialog.body,
          render_input: true
        });
        
        field.refresh();
        dialog.fields_dict[fieldName] = field;
      } else {
        // Show existing field
        dialog.fields_dict[fieldName].df.hidden = false;
        dialog.fields_dict[fieldName].$wrapper.show();
        dialog.fields_dict[fieldName].df.label = __(labelName);
        
        // Update options with current field values
        dialog.fields_dict[fieldName].df.options = populatedFields.map(f => {
          return {
            label: `${f.label}: ${String(frm.doc[f.fieldname] || '')}`,
            value: String(frm.doc[f.fieldname] || '')
          };
        });
        
        dialog.fields_dict[fieldName].refresh();
      }
    });
  }

  // Helper to get fields that have values
  getPopulatedFields(frm, minCount = 10, excludeFields = []) {
    let populated = [];
    let priorities = [
      "first_name", "last_name", "email", "mobile_no", "phone", 
      "company_name", "website", "status", "source", "industry",
      "address_line1", "address_line2", "city", "state", "country",
      "pincode", "gender", "salutation", "designation", "department"
    ];
    
    // First, try to get all the priority fields that have values
    if (frappe.get_meta(frm.doctype)) {
      priorities.forEach(fieldName => {
        if (excludeFields.includes(fieldName)) return;
        
        let field = frappe.get_meta(frm.doctype).fields.find(f => f.fieldname === fieldName);
        if (
          field && 
          !field.hidden && 
          frm.doc[fieldName] !== undefined && 
          frm.doc[fieldName] !== null && 
          frm.doc[fieldName] !== ""
        ) {
          populated.push({
            label: field.label || field.fieldname,
            fieldname: field.fieldname,
            value: frm.doc[field.fieldname]
          });
        }
      });
    }
    
    // If we don't have enough priority fields, add other fields with values
    if (populated.length < minCount) {
      // Get metadata for the doctype
      if (frappe.get_meta(frm.doctype)) {
        // Check all other fields
        frappe.get_meta(frm.doctype).fields.forEach((df) => {
          if (
            !df.hidden && 
            df.fieldname && 
            !excludeFields.includes(df.fieldname) &&
            !priorities.includes(df.fieldname) && // Skip fields we already checked
            frm.doc[df.fieldname] !== undefined && 
            frm.doc[df.fieldname] !== null && 
            frm.doc[df.fieldname] !== "" &&
            populated.length < minCount
          ) {
            populated.push({
              label: df.label || df.fieldname,
              fieldname: df.fieldname,
              value: frm.doc[df.fieldname]
            });
          }
        });
      }
    }
    
    return populated;
  }

  // Helper to parse table fields from various formats
  parseTableField(field) {
    // If null or undefined, return empty array
    if (field == null) return [];

    // If already an array, return it
    if (Array.isArray(field)) return field;

    // If it's a string, try to parse it as JSON
    if (typeof field === "string") {
      try {
        return JSON.parse(field);
      } catch (e) {
        console.error("Error parsing field:", e);
        return [];
      }
    }

    // If it has rows property (frappe table format)
    if (field.rows) return field.rows;

    console.error("Unknown field format:", field);
    return [];
  }
};

// Setup function
frappe.ui.setup_template_sender = function (frm, opts = {}) {
  opts.doctype = frm.doctype;
  opts.docname = frm.docname;

  let template_sender = new verloop.ui.components.TemplateSender(opts);
  template_sender.add_button_to_form(frm);

  return template_sender;
};

frappe.ui.form.on("Lead", {
  refresh(frm) {
    frappe.ui.setup_template_sender(frm);
    console.log("Template sender button added");
  },
});