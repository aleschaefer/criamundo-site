const SITE_STORAGE_KEY = "rio2c-site-data";

function cloneSiteData(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeSiteData(data) {
  const base = cloneSiteData(defaultSiteData);
  if (!data || typeof data !== "object") {
    return base;
  }

  const normalized = {
    siteConfig: {
      contact: {
        ...base.siteConfig.contact,
        ...(data.siteConfig && data.siteConfig.contact ? data.siteConfig.contact : {})
      },
      challengeForm: {
        ...base.siteConfig.challengeForm,
        ...(data.siteConfig && data.siteConfig.challengeForm
          ? data.siteConfig.challengeForm
          : {})
      }
    },
    featuredProject: {
      ...base.featuredProject,
      ...(data.featuredProject || {})
    },
    projectGroups: Array.isArray(data.projectGroups)
      ? data.projectGroups.map((group) => ({
          category: group.category || "Nova categoria",
          items: Array.isArray(group.items)
            ? group.items.map((item) => ({
                title: item.title || "",
                format: item.format || "",
                genre: item.genre || "",
                logline: item.logline || "",
                status: item.status || "",
                audience: item.audience || ""
              }))
            : []
        }))
      : base.projectGroups
  };

  return normalized;
}

function loadSiteData() {
  try {
    const raw = localStorage.getItem(SITE_STORAGE_KEY);
    if (!raw) {
      return cloneSiteData(defaultSiteData);
    }

    return normalizeSiteData(JSON.parse(raw));
  } catch (error) {
    console.error("Não foi possível carregar os dados salvos.", error);
    return cloneSiteData(defaultSiteData);
  }
}

function loadPublishedSiteData() {
  return cloneSiteData(defaultSiteData);
}

function saveSiteData(data) {
  const normalized = normalizeSiteData(data);
  localStorage.setItem(SITE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function resetSiteData() {
  localStorage.removeItem(SITE_STORAGE_KEY);
  return cloneSiteData(defaultSiteData);
}
