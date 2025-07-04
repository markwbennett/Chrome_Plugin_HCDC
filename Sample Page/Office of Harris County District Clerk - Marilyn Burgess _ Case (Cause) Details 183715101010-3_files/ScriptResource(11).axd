﻿// (c) Copyright Microsoft Corporation.
// This source is subject to the Microsoft Permissive License.
// See http://www.microsoft.com/resources/sharedsource/licensingbasics/sharedsourcelicenses.mspx.
// All other rights reserved.


/// <reference name="MicrosoftAjax.debug.js" />
/// <reference name="MicrosoftAjaxTimer.debug.js" />
/// <reference name="MicrosoftAjaxWebForms.debug.js" />
/// <reference path="../ExtenderBase/BaseScripts.js" />
/// <reference path="../Common/Common.js" />


Type.registerNamespace('AjaxControlToolkit');

AjaxControlToolkit.HoverBehavior = function(element) {
    /// <param name="element">The DOM element the behavior is associated with.</param>
    AjaxControlToolkit.HoverBehavior.initializeBase(this, [element]);
    
    // NOTE: DomEvent handler is specific to the dom element; so these are now 2-element arrays
    // where index 0 is the handler for element and index 1 is the handler for hoverElement.
    this._elementHandlers = null;
    this._hoverElementHandlers = null;
    
    this._hoverElement = null;
    this._hoverCount = 0;
    this._unhoverDelay = 0;
    this._hoverDelay = 0;
    this._hoverScript = null;
    this._unhoverScript = null;   
    this._hoverFired = false; 
}
    
AjaxControlToolkit.HoverBehavior.prototype = {
    _setupHandlersArray: function() {
        var target = [];        
        target[0] = Function.createDelegate(this, this._onHover);                
        target[1] = Function.createDelegate(this, this._onUnhover);        
        return target;
    },
    
    get_elementHandlers: function() {
        
        if (!this._elementHandlers) {
            this._elementHandlers = this._setupHandlersArray();
        }
        return this._elementHandlers;
    },
    
    get_hoverElementHandlers: function() {
        
        if (!this._hoverElementHandlers) {
            this._hoverElementHandlers = this._setupHandlersArray();
        }
        return this._hoverElementHandlers;
    },

    get_hoverElement: function() {        
        /// <value type="Object">Dom element associated with this behavior.</value>       
       
        return this._hoverElement;
    },
    
    set_hoverElement: function(element) {
        /// <param name="element" type="Object">Dom element associated with this behavior.</param>
                
        if (element != this._hoverElement) {
            
            if (this._hoverElement) {
                this._setupHandlers(this._hoverElement, this.get_hoverElementHandlers(), false);
            }
            
            this._hoverElement = element;
            
            if (this._hoverElement) {
                this._setupHandlers(this._hoverElement, this.get_hoverElementHandlers(), true);
            }            
        }
    },
    
    get_hoverDelay: function() {
        /// <value type="Number">Delay in milliseconds before unhover event is raised.</value>
        return this._hoverDelay;
    },
    
    set_hoverDelay: function(value) {
        /// <param name="value" type="Number">Delay in milliseconds before unhover event is raised.</param>
        this._hoverDelay = value;
        this.raisePropertyChanged('hoverDelay');
    },
    
    get_hoverScript: function() {
        return this._hoverScript;
    },
    
    set_hoverScript : function(script) {
        this._hoverScript = script;
    },
    
    get_unhoverDelay: function() {
        /// <value type="Number">Delay in milliseconds before unhover event is raised.</value>
        return this._unhoverDelay;
    },
    
    set_unhoverDelay: function(value) {
        /// <param name="value" type="Number">Delay in milliseconds before unhover event is raised.</param>
        this._unhoverDelay = value;
        this.raisePropertyChanged('unhoverDelay');
    },
    
    get_unhoverScript: function() {
        return this._unhoverScript;
    },
    
    set_unhoverScript : function(script) {
        this._unhoverScript = script;
    },

    dispose: function() {
        var element = this.get_element();
        
        if (this._elementHandlers) {
            var handlers = this.get_elementHandlers();
            this._setupHandlers(element, handlers, false);
            this._elementHandlers = null;
        }
       
        if(this._hoverElement) {
            var handlers = this.get_hoverElementHandlers();
            this._setupHandlers(this._hoverElement, handlers, false);
            this._hoverElement = null;
        }        
        AjaxControlToolkit.HoverBehavior.callBaseMethod(this, 'dispose');
    },

    initialize: function() {
        AjaxControlToolkit.HoverBehavior.callBaseMethod(this, 'initialize');
        
        var handlers = this.get_elementHandlers();
        
        this._setupHandlers(this.get_element(), handlers, true);
        
        if (this._hoverElement) {
            handlers = this.get_hoverElementHandlers();
            this._setupHandlers(this._hoverElement, handlers, true);
        }
    },

    add_hover: function(handler) {
        this.get_events().addHandler("hover", handler);
    },

    remove_hover: function(handler) {
        this.get_events().removeHandler("hover", handler);
    },
    
    _fireHover : function() {
    
        if (!this._hoverCount || this._hoverFired) {
            return;
        }
        
        var handler = this.get_events().getHandler("hover");
        if (handler) {
            handler(this, Sys.EventArgs.Empty);
        }
        if (this._hoverScript) {
            eval(this._hoverScript);
        }
        this._hoverFired = true;
    },
    
    _onHover: function() {
        this._hoverCount++;
        
        if (!this._hoverDelay) {
            this._fireHover();
        }
        else {
            window.setTimeout(Function.createDelegate(this, this._fireHover), this._hoverDelay);
        }
    },

    add_unhover: function(handler) {
        this.get_events().addHandler("unhover", handler);
    },
    
    remove_unhover: function(handler) {
        this.get_events().removeHandler("unhover", handler);
    },
    
    _fireUnhover : function() {
        if (this._hoverFired && !this._hoverCount) {
            this._hoverFired = false;
            var handler = this.get_events().getHandler("unhover");
            if (handler) {
                handler(this, Sys.EventArgs.Empty);
            }
            if (this._unhoverScript) {
                eval(this._unhoverScript);
            }                  
        }
    },
    
    _onUnhover: function() {
        this._hoverCount--;
  
        if (this._hoverCount <= 0) {
        
            // Because Safari fires events differently, it's possible in some scenarios to
            // have mouseout fire before mouseover, so make sure we never get a negative _hoverCount
            this._hoverCount = 0;   
        
            if (!this._unhoverDelay) {
                this._fireUnhover();
            }
            else {
                window.setTimeout(Function.createDelegate(this, this._fireUnhover), this._unhoverDelay);
            }       
            
        }
    },
    
    _setupHandlers: function(element, handlers, hookup) {        
    
        if (!this.get_isInitialized() || !element) return;
        
        if (hookup) {
            $addHandler(element, "mouseover", handlers[0]);        
            $addHandler(element, "focus", handlers[0]);        
            $addHandler(element, "mouseout", handlers[1]);        
            $addHandler(element, "blur", handlers[1]);
        }
        else {
            $removeHandler(element, "mouseover", handlers[0]);        
            $removeHandler(element, "focus", handlers[0]);        
            $removeHandler(element, "mouseout", handlers[1]);        
            $removeHandler(element, "blur", handlers[1]);
        }            
    }
}
AjaxControlToolkit.HoverBehavior.descriptor = {
    properties: [   {name: 'hoverElement', isDomElement: true},
                    {name: 'unhoverDelay', type: Number} ],
    events: [   {name: 'hover'},
                {name: 'unhover'} ]
}
AjaxControlToolkit.HoverBehavior.registerClass('AjaxControlToolkit.HoverBehavior', AjaxControlToolkit.BehaviorBase);
