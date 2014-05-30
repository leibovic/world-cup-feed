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

const FEED_EDITION_PREF = "worldCupFeed.feedEdition";
const SNIPPETS_COUNTRY_CODE_PREF = "browser.snippets.countryCode";

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

var FeedEditions = {
  INTL: {
    get label() {
      return Strings.GetStringFromName("feedEdition.international");
    },
    feed: "http://www.goal.com/en/feeds/news?fmt=rss&ICID=HP"
  },
  AR: {
    get label() {
      return RegionNames.GetStringFromName("ar");
    },
    feed: "http://www.goal.com/es-ar/feeds/news?fmt=rss&ICID=HP"
  },
  MX: {
    get label() {
      return RegionNames.GetStringFromName("mx");
    },
    feed: "http://www.goal.com/es-mx/feeds/news?fmt=rss&ICID=HP"
  },
  CO: {
    get label() {
      return RegionNames.GetStringFromName("co");
    },
    feed: "http://www.goal.com/es-co/feeds/news?fmt=rss&ICID=HP"
  },
  CL: {
    get label() {
      return RegionNames.GetStringFromName("cl");
    },
    feed: "http://www.goal.com/es-cl/feeds/news?fmt=rss&ICID=HP"
  },
  BR: {
    get label() {
      return RegionNames.GetStringFromName("br");
    },
    feed: "http://www.goal.com/br/feeds/news?fmt=rss&ICID=HP"
  },
  DE: {
    get label() {
      return RegionNames.GetStringFromName("de");
    },
    feed: "http://www.goal.com/de/feeds/news?fmt=rss&ICID=HP"
  },
  ES: {
    get label() {
      return RegionNames.GetStringFromName("es");
    },
    feed: "http://www.goal.com/es/feeds/news?fmt=rss&ICID=HP"
  },
  GB: {
    get label() {
      return RegionNames.GetStringFromName("gb");
    },
    feed: "http://www.goal.com/en-gb/feeds/news?fmt=rss&ICID=HP"
  },
  IT: {
    get label() {
      return RegionNames.GetStringFromName("it");
    },
    feed: "http://www.goal.com/it/feeds/news?fmt=rss&ICID=HP"
  },
  FR: {
    get label() {
      return RegionNames.GetStringFromName("fr");
    },
    feed: "http://www.goal.com/fr/feeds/news?fmt=rss&ICID=HP"
  },
  US: {
    get label() {
      return RegionNames.GetStringFromName("us");
    },
    feed: "http://www.goal.com/en-us/feeds/news?fmt=rss&ICID=HP"
  },
  ID: {
    get label() {
      return RegionNames.GetStringFromName("id");
    },
    feed: "http://www.goal.com/id-ID/feeds/news?fmt=rss&ICID=HP"
  },
  IN: {
    get label() {
      return RegionNames.GetStringFromName("in");
    },
    feed: "http://www.goal.com/en-india/feeds/news?fmt=rss&ICID=HP"
  },
  JA: {
    get label() {
      return RegionNames.GetStringFromName("jp");
    },
    feed: "http://www.goal.com/jp/feeds/news?fmt=rss&ICID=HP"
  }
};

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
    let key = Services.prefs.getCharPref(SNIPPETS_COUNTRY_CODE_PREF);
    if (key in FeedEditions) {
      return key;
    }
  } catch (e) {}

  // Default to the international edition.
  return "INTL";
}

function optionsCallback() {
  return {
    title: "goal.com",
    views: [{
      type: Home.panels.View.LIST,
      dataset: DATASET_ID,
      onrefresh: refreshDataset
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
    option.textContent = FeedEditions[key].label;
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

  let link = doc.getElementById("sumo-link");
  link.href = "https://support.mozilla.org";
  link.textContent = Strings.GetStringFromName("settings.help");
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
    let label = FeedEditions[key].label;
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
        if (FeedEditions[key].label == label) {
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
