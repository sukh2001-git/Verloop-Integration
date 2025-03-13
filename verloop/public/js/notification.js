frappe.ui.form.on('Notification', {
	map_verloop_fields: function(frm){
        test(frm);
			
	},
	verloop_campaigns: function(frm){
	    if (frm.doc.channel === 'WhatsApp') {
	        
	        if (frm.doc.verloop_campaigns != undefined){
	            let context = {}
	            
	            cur_frm.doc.verloop_parameter = []
	            cur_frm.doc.verloop_action_parameter = []
	            cur_frm.refresh_fields("verloop_parameter");
	            cur_frm.refresh_fields("verloop_action_parameter");
	            
	            frappe.db.get_doc("Verloop Campaigns", frm.doc.verloop_campaigns)
	            .then((data) => {
	               
	                let template_id = data.template_id
	                frappe.db.get_doc("Verloop Templates", template_id)
	                .then((row) =>{
	                    let template_parameters = row.parameters;
	                    let template_action_parameter = row.action_parameter;
	                    let context_parameters = {}
	                    let context_action_parameters = {}
	                    template_parameters.forEach((value) => {
	                        context_parameters[value.field_name] = ""
	                        let childTable = cur_frm.add_child("verloop_parameter");
	                        childTable.field_name = value.field_name
	                        cur_frm.refresh_fields("verloop_parameter");
	                    })
	                    template_action_parameter.forEach((value) => {
	                        context_action_parameters[value.field_name] = ""
	                        let childTable = cur_frm.add_child("verloop_action_parameter");
	                        childTable.field_name = value.field_name
	                        cur_frm.refresh_fields("verloop_action_parameter");
	                    })
	                    if(context_parameters){
                            context["parameters"] =  context_parameters
                        }
                        if(context_action_parameters){
                            
                            context["action_parameters"] =  context_action_parameters
                        }
                        if(context){
                            frm.doc.message = JSON.stringify(context)
                        }else{
                            frm.doc.message = ''
                        }
                        refresh_field("message")
                        
	                })
	            })
	        }
	    }
	}
})
function test(frm){
    
    open_dialog(frm)
  function open_dialog(frm) {
    let dialogFields = [
      {
        label: __("Message Content"),
        fieldname: "message_content",
        fieldtype: "Small Text",
        read_only: 1,
        hidden: 1,
      },
    ];

    let d = new frappe.ui.Dialog({
      title: __("Map Fields"),
      fields: dialogFields,
      primary_action_label: __("Map"),
      primary_action(values) {
          frappe.confirm('This will overwrite the message. Are you sure you want to proceed?',
            () => {
                let parameters = {}, action_parameters = {};
                
                Object.keys(values).forEach((key) => {
                  if (key.startsWith("param_")) {
                    parameters[key.replace("param_", "")] = values[key];
                  }
                  if (key.startsWith("action_param_")) {
                    action_parameters[key.replace("action_param_", "")] = values[key];
                  }
                  let temp_param = {}
                  let temp_action_param = {}
                  for (const [k, value] of Object.entries(parameters)){
                      temp_param[k] = "{{ doc." + value + " }}";
                      frm.doc.verloop_parameter.forEach((f) =>{
    						if(f.field_name == k){
    							f.field_value = value
    						}
    					})
                  }
                  for (const [k, value] of Object.entries(action_parameters)){
                      temp_action_param[k] = "{{ doc." + value + " }}";
                      frm.doc.verloop_action_parameter.forEach((f) =>{
    						if(f.field_name == k){
    							f.field_value = value
    						}
    					})
                  }
                  frm.refresh_fields("verloop_action_parameter");
                  frm.refresh_fields("verloop_parameter");
                  let context = {};
                  if(temp_param){
                      context["parameters"] =  temp_param
                  }
                  if(temp_action_param){
                      context["action_parameters"] =  temp_action_param
                  }
                  if(context){
                      frm.doc.message = JSON.stringify(context)
                  }else{
                    frm.doc.message = ''
                  }
                  refresh_field("message")
                  frm.dirty()
                });
    
                d.hide();
            },() => {
          // action to perform if No is selected
        })
      },
      secondary_action_label: __("Discard"),
      secondary_action() {
        d.hide();
      },
    });

    
      let campaign_id = frm.doc.verloop_campaigns;
    
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

              loadTemplateData(d, template_id, campaign_id, frm);
            }
          },
        });
      }
    

    d.show();
  }

  function loadTemplateData(dialog, template_id, campaign_id, frm) {
    if (template_id) {
      fetchTemplateById(dialog, template_id, frm);
    } else {
      fetchTemplateByCampaignId(dialog, campaign_id, frm);
    }
  }

  function fetchTemplateById(dialog, template_id, frm) {
    frappe.call({
      method: "frappe.client.get",
      args: {
        doctype: "Verloop Templates",
        name: template_id,
        fields: ["message_content", "parameters", "action_parameter"],
      },
      callback: (t) => {
        if (t.message) {
          updateDialogWithTemplateData(dialog, t.message, frm);
        }
      },
    });
  }

  function fetchTemplateByCampaignId(dialog, campaign_id, frm) {
    frappe.call({
      method: "frappe.client.get_list",
      args: {
        doctype: "Verloop Templates",
        filters: { campaign_id: campaign_id },
        fields: ["name"],
      },
      callback: (t) => {
        if (t.message && t.message.length > 0) {
          fetchTemplateById(dialog, t.message[0].name, frm);
        } else {
          frappe.msgprint(__("No template found for this campaign"));
        }
      },
    });
  }

  function updateDialogWithTemplateData(dialog, template, frm) {
    dialog.set_value("message_content", template.message_content);
    dialog.fields_dict.message_content.df.hidden = false;
    dialog.fields_dict.message_content.refresh();

    // // Clear existing fields and add new ones
    // this.clearDynamicFields(dialog);
    
    // Add parameter fields
    let paramList = parseTableField(template.parameters);
    let actionParamList = parseTableField(template.action_parameter);
    
    if (paramList.length) {
      addParameterFields(dialog, paramList, frm, "param_");
    }
    
    if (actionParamList.length) {
      addParameterFields(dialog, actionParamList, frm, "action_param_");
    }
    
    dialog.refresh();
  }
  function addParameterFields(dialog, paramList, frm, prefix) {
    if (!paramList.length) return;
    
    let populatedFields = getPopulatedFields(frm);
    
    paramList.forEach((param, index) => {
   
      let labelName = prefix === "param_" ? `Parameter ${index + 1}` : `Action Parameter ${index + 1}`;
      let paramName = param.field_name || `${index + 1}`;

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

  function getPopulatedFields(frm) {
    let fields = frappe.get_meta(frm.doc.document_type)
    
    let data_link_dict = {}
    let doc_field_list = []
	fields.fields.forEach((e) => { if (e.fieldtype == "Data" || e.fieldtype == "Link") { data_link_dict[e.fieldname] = e.label } })
	for (const [key, value] of Object.entries(data_link_dict)) {

		doc_field_list.push({
		    label: `${value}`,
            value: key
		})
	}
    return doc_field_list
  }

  function parseTableField(field) {
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

