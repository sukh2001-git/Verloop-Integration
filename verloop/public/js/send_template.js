frappe.provide("verloop.ui.components");

verloop.ui.components.TemplateSender = class TemplateSender {
  constructor(opts) {
    this.options = {
      doctype: null,
      docname: null,
      button_label: __("Send Template"),
      menu_location: "Actions",
      send_method: "verloop.verloop.utils.send_verloop_msg",
      callback: null,
    };

    Object.assign(this.options, opts || {});

    if (!this.options.doctype || !this.options.docname) {
      frappe.throw(__("Doctype and docname are required for Template Sender"));
    }
  }

  add_button_to_form(frm) {
    if (!frm.is_new()) {
      frm.page.add_menu_item(
        this.options.button_label,
        () => this.open_dialog(frm),
        this.options.menu_location
      );
    }
  }

  open_dialog(frm) {
    let me = this;
    let docname = this.options.docname || frm.docname;
    let defaultNumbers = this.getPhoneNumbers(frm);

    let dialogFields = [
      {
        label: __("To"),
        fieldname: "mobile_no",
        fieldtype: "MultiSelect",
        options: defaultNumbers.join("\n"),
        reqd: 1,
      },
      {
        label: __("Campaign"),
        fieldname: "campaign",
        fieldtype: "Link",
        options: "Verloop Campaigns",
        reqd: 1,
        get_query: () => {
          return {
            filters: [["Verloop Campaigns", "is_deleted", "!=", 1]],
          };
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
        let parameters = {}, action_parameters = {};
        
        Object.keys(values).forEach((key) => {
          if (key.startsWith("param_")) {
            parameters[key.replace("param_", "")] = values[key];
          }
          if (key.startsWith("action_param_")) {
            action_parameters[key.replace("action_param_", "")] = values[key];
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

    d.fields_dict.campaign.df.onchange = function() {
      let campaign_id = this.get_value();
      if (campaign_id) {
        d.set_title(__(`Send Template: Loading...`));
        
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
              
              d.set_title(__(`Send Template: ${campaign_name || campaign_id}`));
              d.set_value("campaign_name", campaign_name);

              me.loadTemplateData(d, template_id, campaign_id, frm);
            }
          },
        });
      }
    };

    d.show();
  }

  loadTemplateData(dialog, template_id, campaign_id, frm) {
    if (template_id) {
      this.fetchTemplateById(dialog, template_id, frm);
    } else {
      this.fetchTemplateByCampaignId(dialog, campaign_id, frm);
    }
  }

  fetchTemplateById(dialog, template_id, frm) {
    frappe.call({
      method: "frappe.client.get",
      args: {
        doctype: "Verloop Templates",
        name: template_id,
        fields: ["message_content", "parameters", "action_parameter"],
      },
      callback: (t) => {
        if (t.message) {
          this.updateDialogWithTemplateData(dialog, t.message, frm);
        }
      },
    });
  }

  fetchTemplateByCampaignId(dialog, campaign_id, frm) {
    frappe.call({
      method: "frappe.client.get_list",
      args: {
        doctype: "Verloop Templates",
        filters: { campaign_id: campaign_id },
        fields: ["name"],
      },
      callback: (t) => {
        if (t.message && t.message.length > 0) {
          this.fetchTemplateById(dialog, t.message[0].name, frm);
        } else {
          frappe.msgprint(__("No template found for this campaign"));
        }
      },
    });
  }

  updateDialogWithTemplateData(dialog, template, frm) {
    dialog.set_value("message_content", template.message_content);
    dialog.fields_dict.message_content.df.hidden = false;
    dialog.fields_dict.message_content.refresh();

    // Clear existing fields and add new ones
    this.clearDynamicFields(dialog);
    
    // Add parameter fields
    let paramList = this.parseTableField(template.parameters);
    let actionParamList = this.parseTableField(template.action_parameter);
    
    if (paramList.length) {
      this.addParameterFields(dialog, paramList, frm, "param_");
    }
    
    if (actionParamList.length) {
      this.addParameterFields(dialog, actionParamList, frm, "action_param_");
    }
    
    dialog.refresh();
  }

  getPhoneNumbers(frm) {
    let phoneFields = [
      "mobile_no", "phone", "phone_no", "contact", "mobile", "whatsapp"
    ];
    let numbers = [];
    
    phoneFields.forEach((field) => {
      if (frm.doc[field] && frm.doc[field].trim && frm.doc[field].trim()) {
        numbers.push(frm.doc[field]);
      }
    });
    
    return numbers;
  }

  clearDynamicFields(dialog) {
    if (!dialog.fields_dict) return;
    
    Object.keys(dialog.fields_dict).forEach((field) => {
      if (field.startsWith("param_") || field.startsWith("action_param_")) {
        dialog.fields_dict[field].df.hidden = true;
        dialog.fields_dict[field].$wrapper.hide();
      }
    });
  }

  addParameterFields(dialog, paramList, frm, prefix) {
    if (!paramList.length) return;
    
    let populatedFields = this.getPopulatedFields(frm);
    
    paramList.forEach((param, index) => {
      let labelName = prefix === "param_" ? `Parameter ${index + 1}` : `Action Parameter ${index + 1}`;
      let paramName = param.parameter_name || param.name || `param_${index + 1}`;
      let fieldName = `${prefix}${paramName}`;
      
      if (!dialog.fields_dict[fieldName]) {
        let fieldDef = {
          label: __(labelName),
          fieldname: fieldName,
          fieldtype: "Autocomplete",
          options: populatedFields
        };
        
        dialog.fields.push(fieldDef);
        
        let field = frappe.ui.form.make_control({
          df: fieldDef,
          parent: dialog.body,
          render_input: true
        });
        
        field.refresh();
        dialog.fields_dict[fieldName] = field;
      } else {
        dialog.fields_dict[fieldName].df.hidden = false;
        dialog.fields_dict[fieldName].$wrapper.show();
      }
    });
  }

  getPopulatedFields(frm) {
    let populated = [];
    let fields = frappe.get_meta(frm.doctype).fields;
    
    fields.forEach((df) => {
      if (!df.hidden && frm.doc[df.fieldname]) {
        populated.push({
          label: `${df.label}: ${frm.doc[df.fieldname]}`,
          value: frm.doc[df.fieldname]
        });
      }
    });
    
    return populated;
  }

  parseTableField(field) {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    
    if (typeof field === "string") {
      try { return JSON.parse(field); } 
      catch (e) { return []; }
    }
    
    if (field.rows) return field.rows;
    return [];
  }
};

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
  },
});