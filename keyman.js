const St = imports.gi.St;
const Gtk = imports.gi.Gtk;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;
//const Meta = imports.gi.Meta;

const _ = imports.gettext.domain('keyman').gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Clipboard = Me.imports.clipboard;
const Bookmarks = Me.imports.bookmarks.Bookmarks;
const KeyringConnection = Me.imports.keyringDbus.KeyringConnection;
const Utils = Me.imports.utils;
//const mySettings = Utils.getSettings();

const MAX_LENGTH = 100;
const KEY_RETURN = 65293;
const KEY_ENTER = 65421;
const key_open = 'open-keyman';    // Schema key for key binding

const dataDir = Utils.joinPaths([GLib.get_user_data_dir(), "KeyMan"]);

const CollectionItem = new Lang.Class({
    Name: "CollectionItem",
    Extends: PopupMenu.PopupSwitchMenuItem,
    
    _init: function(keyring, collection) {
        this.parent(collection.label, !collection.locked);
        
        this.keyring = keyring;
        this.collection = collection;
        
        this.connect('activate', Lang.bind(this, this._toggle));
    },
    
    _toggle: function() {
        if (this.collection.locked) {
            this.keyring.unlockObject(this.collection.path,
                Lang.bind(this, function(wasLockedBefore) {
                    this.collection.locked = false;
                }));
        } else {
            this.keyring.lockObject(this.collection.path);
            this.collection.locked = true;
        }
    }
})

const KeyMan = new Lang.Class({
    Name: "KeyMan",
    Extends: PanelMenu.Button,
    
    _init: function() {
        this.parent(St.Align.START);

        // connect to keyring
        this.keyring = new KeyringConnection();
        
        // initialize bookmarks
        this.bookmarks = new Bookmarks(dataDir);
        
        // remember timeouts
        this.timeouts = []
        
        this.buttonText = new St.Label({text:_("KM")});
        this.buttonText.set_style("text-align:center;");
        this.actor.add_actor(this.buttonText);
        this.buttonText.get_parent().add_style_class_name("panelButtonWidth");
        
        // Add keybinding
        /*global.display.add_keybinding
        (
            key_open,
            mySettings,
            Meta.KeyBindingFlags.NONE,
            Lang.bind(this, function() { this.menu.open(); })
        );*/
        
        // Auto focus
        this.menu.connect('open-state-changed',
            Lang.bind(this, function(menu, open) {
                // this is triggered when the keymanager menu is opened
                if (open) {
                    this.searchEntry.grab_key_focus();
                } else {
                    this.searchEntry.get_stage().set_key_focus(null);
                }
            })
        );
        
        this._createLayout();
    },
    
    _getSecretCallback: function(label, secret) {
        this._removeTimeouts();
        Clipboard.set(secret);
        
        // TODO put sleep time into preferences
        this.timeouts.push(Mainloop.timeout_add(5000, function() {
            Clipboard.empty();
        }));
    },
    
    _copySecret: function(path) {
        this.keyring.getSecretFromPath(path,
                Lang.bind(this, this._getSecretCallback));
    },
    
    _createSecretMenuItem: function(item) {
        let pmi = new PopupMenu.PopupMenuItem(item.label);
        pmi.connect('activate', Lang.bind(this, function() {
            this.menu.close();
            this._copySecret(item.path);
        }));
        return pmi;
    },
    
    _clearSearchResults: function() {
        this.searchResultsSection.removeAll();
    },
    
    _createLayout: function() {
        // Create unlock menu
        this.collectionsMenu = new PopupMenu.PopupSubMenuMenuItem(
            _("Keyrings"), true);
        
        // TODO watch for changes
        let collections = this.keyring.getCollections();
        for (let i in collections) {
            let col = collections[i];
            if (col.path != "/org/freedesktop/secrets/collection/session") {
                // we don't add the item via addMenuItem because we do not
                // want the menu to close if the item is clicked
                this.collectionsMenu.menu.box.add(
                    new CollectionItem(this.keyring, col).actor);
            }
        }
        this.menu.addMenuItem(this.collectionsMenu);
        
        let separator1 = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(separator1);

        // Create bookmarked keys box
        this.bookmarksSection = new PopupMenu.PopupMenuSection();

        // Create scrollview
        /*this.scrollView = new St.ScrollView({style_class: 'vfade',
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                vscrollbar_policy: Gtk.PolicyType.AUTOMATIC});
        this.scrollView.add_actor(this.bookmarksBox);
        this.mainBox.add_actor(this.scrollView);*/
        
        // add bookmarks
        for (let bookmark in this.bookmarks.iterator()) {
            this.bookmarksSection.addMenuItem(this._createSecretMenuItem(bookmark));
        }
        this.menu.addMenuItem(this.bookmarksSection);
        
        // Separator
        let separator2 = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(separator2);
        
        // Bottom section: Search
        let bottomSection = new PopupMenu.PopupMenuSection();
        
        this.searchResultsSection = new PopupMenu.PopupMenuSection();
        
        this.searchEntry = new St.Entry(
        {
            name: "searchEntry",
            hint_text: _("Search..."),
            track_hover: true,
            can_focus: true
        });
        
        let entrySearch = this.searchEntry.clutter_text;
        entrySearch.set_max_length(MAX_LENGTH);
        entrySearch.connect('key-press-event', Lang.bind(this, function(o, e) {
            let symbol = e.get_key_symbol();
            if (symbol == KEY_RETURN || symbol == KEY_ENTER) {
                this._clearSearchResults();
            
                //this.menu.close();
                let searchStrs = o.get_text().trim().split(/\s+/);
                searchStrs = searchStrs.filter(function(s) s != "");
                
                if (searchStrs.length > 0) {
                    let items = this.keyring.getItems(searchStrs);
                    
                    if (items.length > 0) {
                        for (let i in items) {
                            let item = items[i];
                            let mi = this._createSecretMenuItem(item);
                            this.searchResultsSection.addMenuItem(mi);
                        }
                    } else {
                        let it = new PopupMenu.PopupMenuItem(_("Nothing found."));
                        this.searchResultsSection.addMenuItem(it);
                    }
                }
            }
            
        }));
        
        bottomSection.actor.add_actor(this.searchEntry);
        bottomSection.addMenuItem(this.searchResultsSection);
        bottomSection.actor.add_style_class_name("searchSection");
        this.menu.addMenuItem(bottomSection);
    },
    
    _enable: function() {
    },

    _removeTimeouts: function() {
        while (this.timeouts.length > 0) {
            Mainloop.source_remove(this.timeouts.pop());
        }
    },

    _disable: function() {
        this.keyring.close();
        this._removeTimeouts();
        this.bookmarks.close();
    }
})
