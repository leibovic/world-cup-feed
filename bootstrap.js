const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Home.jsm");
Cu.import("resource://gre/modules/HomeProvider.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const PANEL_ID = "world.cup.feed.panel@mozilla.org";
const DATASET_ID = "world.cup.feed.dataset@mozilla.org";

var gFeedUrls = {
  // Argentina
  AR: "http://www.goal.com/es-ar/feeds/news?fmt=rss&ICID=HP",
  // Mexico
  MX: "http://www.goal.com/es-mx/feeds/news?fmt=rss&ICID=HP",
  // Colombia
  CO: "http://www.goal.com/es-co/feeds/news?fmt=rss&ICID=HP",
  // Chile
  CL: "http://www.goal.com/es-cl/feeds/news?fmt=rss&ICID=HP",
  // Brazil
  BR: "http://www.goal.com/br/feeds/news?fmt=rss&ICID=HP",
  // Germany
  DE: "http://www.goal.com/de/feeds/news?fmt=rss&ICID=HP",
  // Spain
  ES: "http://www.goal.com/es/feeds/news?fmt=rss&ICID=HP",
  // United Kington
  GB: "http://www.goal.com/en-gb/feeds/news?fmt=rss&ICID=HP",
  // Italy
  IT: "http://www.goal.com/it/feeds/news?fmt=rss&ICID=HP",
  // France
  FR: "http://www.goal.com/fr/feeds/news?fmt=rss&ICID=HP",
  // United States
  US: "http://www.goal.com/en-us/feeds/news?fmt=rss&ICID=HP",
  // Indonesia
  ID: "http://www.goal.com/id/feeds/news?fmt=rss&ICID=HP",
  // India
  IN: "http://www.goal.com/en-india/feeds/news?fmt=rss&ICID=HP"
};

// An example of how to create a string bundle for localization.
XPCOMUtils.defineLazyGetter(this, "Strings", function() {
  return Services.strings.createBundle("chrome://worldcupfeed/locale/worldcupfeed.properties");
});

XPCOMUtils.defineLazyGetter(this, "FeedHelper", function() {
  let sandbox = {};
  Services.scriptloader.loadSubScript("chrome://worldcupfeed/content/FeedHelper.js", sandbox);
  return sandbox["FeedHelper"];
});

// Take advantage of the fact that Snippets.js already caches the user's country code.
XPCOMUtils.defineLazyGetter(this, "gCountryCode", function() {
  try {
    return Services.prefs.getCharPref("browser.snippets.countryCode");
  } catch (e) {
    // Return an empty string if the country code pref isn't set yet.
    return "";
  }
});

function optionsCallback() {
  return {
    title: Strings.GetStringFromName("title"),
    views: [{
      type: Home.panels.View.LIST,
      dataset: DATASET_ID
    }]
  };
}

function refreshDataset() {
  // XXX: Actually choose a feed based on the user's country, falling back to locale.
  // Allow the user to override this with a setting.
  let feedUrl = gFeedUrls.US;

  FeedHelper.parseFeed(feedUrl, function(parsedFeed) {
    let items = FeedHelper.feedToItems(parsedFeed);

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
}

function shutdown(data, reason) {
  if (reason == ADDON_UNINSTALL || reason == ADDON_DISABLE) {
    Home.panels.uninstall(PANEL_ID);
    deleteDataset();
  }

  Home.panels.unregister(PANEL_ID);
}

function install(data, reason) {}

function uninstall(data, reason) {}
