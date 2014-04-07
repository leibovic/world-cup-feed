const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Home.jsm");
Cu.import("resource://gre/modules/HomeProvider.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const ADDON_ID = "world.cup.feed@mozilla.org";
const PANEL_ID = "world.cup.feed.panel@mozilla.org";
const DATASET_ID = "world.cup.feed.dataset@mozilla.org";

const SNIPPETS_COUNTRY_CODE_PREF = "browser.snippets.countryCode";
const WCF_COUNTRY_CODE_PREF = "worldCupFeed.countryCode";

XPCOMUtils.defineLazyGetter(this, "Strings", function() {
  return Services.strings.createBundle("chrome://worldcupfeed/locale/worldcupfeed.properties");
});

XPCOMUtils.defineLazyGetter(this, "RegionNames", function() {
  return Services.strings.createBundle("chrome://global/locale/regionNames.properties");
});

XPCOMUtils.defineLazyGetter(this, "FeedHelper", function() {
  let sandbox = {};
  Services.scriptloader.loadSubScript("chrome://worldcupfeed/content/FeedHelper.js", sandbox);
  return sandbox["FeedHelper"];
});

var Countries = {
  AR: {
    label: RegionNames.GetStringFromName("ar"),
    feed: "http://www.goal.com/es-ar/feeds/news?fmt=rss&ICID=HP"
  },
  MX: {
    label: RegionNames.GetStringFromName("mx"),
    feed: "http://www.goal.com/es-mx/feeds/news?fmt=rss&ICID=HP"
  },
  CO: {
    label: RegionNames.GetStringFromName("co"),
    feed: "http://www.goal.com/es-co/feeds/news?fmt=rss&ICID=HP"
  },
  CL: {
    label: RegionNames.GetStringFromName("cl"),
    feed: "http://www.goal.com/es-cl/feeds/news?fmt=rss&ICID=HP"
  },
  BR: {
    label: RegionNames.GetStringFromName("br"),
    feed: "http://www.goal.com/br/feeds/news?fmt=rss&ICID=HP"
  },
  DE: {
    label: RegionNames.GetStringFromName("de"),
    feed: "http://www.goal.com/de/feeds/news?fmt=rss&ICID=HP"
  },
  ES: {
    label: RegionNames.GetStringFromName("es"),
    feed: "http://www.goal.com/es/feeds/news?fmt=rss&ICID=HP"
  },
  GB: {
    label: RegionNames.GetStringFromName("gb"),
    feed: "http://www.goal.com/en-gb/feeds/news?fmt=rss&ICID=HP"
  },
  IT: {
    label: RegionNames.GetStringFromName("it"),
    feed: "http://www.goal.com/it/feeds/news?fmt=rss&ICID=HP"
  },
  FR: {
    label: RegionNames.GetStringFromName("fr"),
    feed: "http://www.goal.com/fr/feeds/news?fmt=rss&ICID=HP"
  },
  US: {
    label: RegionNames.GetStringFromName("us"),
    feed: "http://www.goal.com/en-us/feeds/news?fmt=rss&ICID=HP"
  },
  ID: {
    label: RegionNames.GetStringFromName("id"),
    feed: "http://www.goal.com/id/feeds/news?fmt=rss&ICID=HP"
  },
  IN: {
    label: RegionNames.GetStringFromName("in"),
    feed: "http://www.goal.com/en-india/feeds/news?fmt=rss&ICID=HP"
  }
};

function getCountryCode() {
  try {
    // First check to see if the user has set a pref for this add-on.
    let code = Services.prefs.getCharPref(WCF_COUNTRY_CODE_PREF);
    if (code in Countries) {
      return code;
    }
  } catch (e) {}

  try {
    // Next, check to see if there's a country code set by snippets.
    let code = Services.prefs.getCharPref(SNIPPETS_COUNTRY_CODE_PREF);
    if (code in Countries) {
      return code;
    }
  } catch (e) {}

  // XXX: Choose a fallback country based on the locale.
  return "US";
}

function optionsCallback() {
  return {
    title: Strings.GetStringFromName("title"),
    views: [{
      type: Home.panels.View.LIST,
      dataset: DATASET_ID
    }]
  };
}

const REGEX = /^http:\/\/(www\.)?([^/]+)\/([-_a-zA-Z]+)\/([-_a-zA-Z0-9]+)((?:\/[-_a-zA-Z0-9]+)+)\/([0-9]+).*$/;

/**
 * Takes a desktop goal.com URL and converts it into a mobile URL.
 *   e.g. "http://www.goal.com/en-us/news/88/spain/2014/03/27/4713470/del-bosque-silent-on-valdes-replacement"
 *   becomes "http://m.goal.com/s/en-us/news/4713470"
 *
 * url.match(REGEX) returns an array like this:
 * [ "http://www.goal.com/en-us/news/88/spain/2014/03/27/4713470/del-bosque-silent-on-valdes-replacement",
 *   "www.", "goal.com", "en-us", "news", "/88/spain/2014/03/27", "4713470" ]
 */
function mobilifyUrl(url) {
  try {
    let match = url.match(REGEX);
    return "http://m." + match[2] + "/s/" + match[3] + "/" + match[4] + "/" + match[6] + "/";
  } catch (e) {
    // If anything goes wrong, just return the original URL.
    Cu.reportError("Error converting item URL to mobile version: " + url);
    return url;
  }
}

function refreshDataset() {
  let code = getCountryCode();
  let feedUrl = Countries[code].feed;

  FeedHelper.parseFeed(feedUrl, function(parsedFeed) {
    let items = FeedHelper.feedToItems(parsedFeed).map(function(item){
      // Hack: Convert URL into its mobile version.
      item.url = mobilifyUrl(item.url);
      return item;
    });

    Task.spawn(function() {
      let storage = HomeProvider.getStorage(DATASET_ID);
      yield storage.deleteAll();
      yield storage.save(items);
    }).then(null, e => Cu.reportError("Error saving data to HomeProvider: " + e));
  });
}

function deleteDataset() {
  Task.spawn(function() {
    let storage = HomeProvider.getStorage(DATASET_ID);
    yield storage.deleteAll();
  }).then(null, e => Cu.reportError("Error deleting data from HomeProvider: " + e));
}

function observe(doc, topic, id) {
  if (id != ADDON_ID) {
    return;
  }

  let setting = doc.getElementById("country-setting");
  setting.setAttribute("title", Strings.GetStringFromName("country"));

  let menupopup = doc.getElementById("country-menupopup");
  for (let code in Countries) {
    let menuitem = doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "menuitem"); 
    menuitem.setAttribute("value", code);
    menuitem.setAttribute("label", Countries[code].label);
    menupopup.appendChild(menuitem);
  }

  let menulist = doc.getElementById("country-menulist");
  menulist.setAttribute("value", getCountryCode());

  menulist.addEventListener("command", function() {
    let newCountryCode = menulist.value;
    Services.prefs.setCharPref(WCF_COUNTRY_CODE_PREF, newCountryCode);
    HomeProvider.requestSync(DATASET_ID, refreshDataset);
  }, false);
}

/**
 * bootstrap.js API
 * https://developer.mozilla.org/en-US/Add-ons/Bootstrapped_extensions
 */
function startup(data, reason) {
  // Always register your panel on startup.
  Home.panels.register(PANEL_ID, optionsCallback);

  switch(reason) {
    case ADDON_INSTALL:
      Home.panels.install(PANEL_ID);
      HomeProvider.requestSync(DATASET_ID, refreshDataset);
      break;

    case ADDON_UPGRADE:
    case ADDON_DOWNGRADE:
      Home.panels.update(PANEL_ID);
      break;
  }

  // Update data once every hour.
  HomeProvider.addPeriodicSync(DATASET_ID, 3600, refreshDataset);

  Services.obs.addObserver(observe, AddonManager.OPTIONS_NOTIFICATION_DISPLAYED, false);
}

function shutdown(data, reason) {
  if (reason == ADDON_UNINSTALL || reason == ADDON_DISABLE) {
    Home.panels.uninstall(PANEL_ID);
    HomeProvider.removePeriodicSync(DATASET_ID);
    deleteDataset();
  }

  Home.panels.unregister(PANEL_ID);

  Services.obs.removeObserver(observe, AddonManager.OPTIONS_NOTIFICATION_DISPLAYED);
}

function install(data, reason) {}

function uninstall(data, reason) {}
