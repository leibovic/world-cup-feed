const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Home.jsm");
Cu.import("resource://gre/modules/HomeProvider.jsm");
Cu.import("resource://gre/modules/Prompt.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const ADDON_ID = "world.cup.feed@mozilla.org";
const PANEL_ID = "world.cup.feed.panel@mozilla.org";
const DATASET_ID = "world.cup.feed.dataset@mozilla.org";

const SNIPPETS_COUNTRY_CODE_PREF = "browser.snippets.countryCode";
const FEED_EDITION_PREF = "worldCupFeed.feedEdition";

XPCOMUtils.defineLazyGetter(this, "Strings", function() {
  return Services.strings.createBundle("chrome://worldcupfeed/locale/worldcupfeed.properties");
});

XPCOMUtils.defineLazyGetter(this, "RegionNames", function() {
  return Services.strings.createBundle("chrome://global/locale/regionNames.properties");
});

XPCOMUtils.defineLazyGetter(this, "LanguageNames", function() {
  return Services.strings.createBundle("chrome://global/locale/languageNames.properties");
});

XPCOMUtils.defineLazyGetter(this, "FeedHelper", function() {
  let sandbox = {};
  Services.scriptloader.loadSubScript("chrome://worldcupfeed/content/FeedHelper.js", sandbox);
  return sandbox["FeedHelper"];
});

var FeedEditions = {
  AR: {
    lang: "es",
    region: "ar",
    feed: "http://www.goal.com/es-ar/feeds/news?fmt=rss&ICID=HP"
  },
  MX: {
    lang: "es",
    region: "mx",
    feed: "http://www.goal.com/es-mx/feeds/news?fmt=rss&ICID=HP"
  },
  CO: {
    lang: "es",
    region: "co",
    feed: "http://www.goal.com/es-co/feeds/news?fmt=rss&ICID=HP"
  },
  CL: {
    lang: "es",
    region: "cl",
    feed: "http://www.goal.com/es-cl/feeds/news?fmt=rss&ICID=HP"
  },
  BR: {
    lang: "pt",
    region: "br",
    feed: "http://www.goal.com/br/feeds/news?fmt=rss&ICID=HP"
  },
  DE: {
    lang: "de",
    feed: "http://www.goal.com/de/feeds/news?fmt=rss&ICID=HP"
  },
  ES: {
    lang: "es",
    region: "es",
    feed: "http://www.goal.com/es/feeds/news?fmt=rss&ICID=HP"
  },
  GB: {
    lang: "en",
    region: "gb",
    feed: "http://www.goal.com/en-gb/feeds/news?fmt=rss&ICID=HP"
  },
  IT: {
    lang: "it",
    feed: "http://www.goal.com/it/feeds/news?fmt=rss&ICID=HP"
  },
  FR: {
    lang: "fr",
    feed: "http://www.goal.com/fr/feeds/news?fmt=rss&ICID=HP"
  },
  US: {
    lang: "en",
    region: "us",
    feed: "http://www.goal.com/en-us/feeds/news?fmt=rss&ICID=HP"
  },
  ID: {
    lang: "id",
    feed: "http://www.goal.com/id/feeds/news?fmt=rss&ICID=HP"
  },
  IN: {
    lang: "en",
    region: "in",
    feed: "http://www.goal.com/en-india/feeds/news?fmt=rss&ICID=HP"
  }
};

function formatLabel(edition) {
  let langLabel = LanguageNames.GetStringFromName(edition.lang);
  if (edition.region) {
    let regionLabel = RegionNames.GetStringFromName(edition.region);
    return Strings.formatStringFromName("feedEdition.labelFormat", [langLabel, regionLabel], 2);
  }
  return langLabel;
}

function getFeedEdition() {
  try {
    // First check to see if the user has set a pref for this add-on.
    let key = Services.prefs.getCharPref(FEED_EDITION_PREF);
    if (key in FeedEditions) {
      return key;
    }
  } catch (e) {}

  try {
    // Next, check to see if there's a country code set by snippets.
    let key = Services.prefs.getCharPref(FEED_EDITION_PREF);
    if (key in FeedEditions) {
      return key;
    }
  } catch (e) {}

  // XXX: Choose a default edition based on the locale.
  return "US";
}

function optionsCallback() {
  return {
    title: Strings.GetStringFromName("panel.title"),
    views: [{
      type: Home.panels.View.LIST,
      dataset: DATASET_ID
    }]
  };
}

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
  const REGEX = /^http:\/\/(www\.)?([^/]+)\/([-_a-zA-Z]+)\/([-_a-zA-Z0-9]+)((?:\/[-_a-zA-Z0-9]+)+)\/([0-9]+).*$/;

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
  let key = getFeedEdition();
  let feedUrl = FeedEditions[key].feed;

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

/**
 * Observes AddonManager.OPTIONS_NOTIFICATION_DISPLAYED notification.
 */
function observe(doc, topic, id) {
  if (id != ADDON_ID) {
    return;
  }

  let setting = doc.getElementById("edition-setting");
  setting.setAttribute("title", Strings.GetStringFromName("feedEdition.label"));

  let options = [];
  for (let key in FeedEditions) {
    let option = doc.createElement("option");
    option.value = key;
    option.textContent = formatLabel(FeedEditions[key]);
    options.push(option);
  }

  // Show options in alphabetical order.
  options.sort(function(a, b) {
    if (a.textContent < b.textContent) {
      return -1;
    }
    if (a.textContent > b.textContent) {
      return 1;
    }
    return 0;
  });

  let select = doc.getElementById("edition-select");
  options.forEach(function (option) {
    select.appendChild(option);
  });

  select.value = getFeedEdition();

  select.addEventListener("change", function() {
    Services.prefs.setCharPref(FEED_EDITION_PREF, select.value);
    HomeProvider.requestSync(DATASET_ID, refreshDataset);
  }, false);
}

/**
 * Opens feed panel and prompts user to choose a feed edition.
 */
function showFeedEditionPrompt() {
  // Open about:home to feed panel.
  let win = Services.wm.getMostRecentWindow("navigator:browser");
  win.BrowserApp.loadURI("about:home?panel=" + PANEL_ID);

  // Array of edition options to show in menulist.
  let values = [];

  let defaultEdition = getFeedEdition();
  let defaultValue;

  for (let key in FeedEditions) {
    let label = formatLabel(FeedEditions[key]);
    if (key == defaultEdition) {
      // Store the default label to put at the front of the array.
      defaultValue = label;
    } else {
      values.push(label);
    }
  }

  // Show non-default values in alphabetical order.
  values.sort();

  // Put default edition at the front of the array so it displays first.
  values.unshift(defaultValue);

  let p = new Prompt({
    title: Strings.GetStringFromName("prompt.title"),
    message: Strings.GetStringFromName("prompt.message"),
    buttons: [Strings.GetStringFromName("prompt.ok")]
  }).addMenulist({
    values: values
  }).show(function (data) {
    // Store the user's preference if they chose a feed edition.
    if (data.menulist0 > 0) {
      let label = values[data.menulist0];
      for (let key in FeedEditions) {
        if (formatLabel(FeedEditions[key]) == label) {
          Services.prefs.setCharPref(FEED_EDITION_PREF, key);
          break;
        }
      }
    }
    refreshDataset();
  });
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
    case ADDON_ENABLE:
      Home.panels.install(PANEL_ID);
      showFeedEditionPrompt();
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
    Services.prefs.clearUserPref(FEED_EDITION_PREF);
  }

  Home.panels.unregister(PANEL_ID);

  Services.obs.removeObserver(observe, AddonManager.OPTIONS_NOTIFICATION_DISPLAYED);
}

function install(data, reason) {}

function uninstall(data, reason) {}
