const SITE_STORAGE_KEY = "rio2c-site-data";
const SITE_BACKUP_STORAGE_KEY = "rio2c-site-data-backups";
const MAX_SITE_BACKUPS = 20;
const CONTENT_API_PATH = "/api/content";
const ADMIN_CONTENT_API_PATH = "/api/admin/content";
const ADMIN_LATEST_BACKUP_API_PATH = "/api/admin/latest-backup";
const STATIC_CONTENT_XML_PATH = "./content.xml";

function createEmptySiteData() {
  return {
    siteConfig: {
      contact: {
        email: "",
        whatsapp: "",
        instagram: ""
      },
      challengeForm: {
        endpoint: "",
        accessKey: "",
        successMessage: "",
        fallbackSubject: "",
        fromName: "",
        subject: ""
      }
    },
    featuredProject: {
      title: "",
      format: "",
      genre: "",
      logline: "",
      status: "",
      audience: ""
    },
    projectGroups: []
  };
}

const legacyDefaultSiteData =
  typeof defaultSiteData === "object" && defaultSiteData
    ? defaultSiteData
    : createEmptySiteData();

function cloneSiteData(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeSiteData(data) {
  const base = cloneSiteData(legacyDefaultSiteData);
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

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getXmlText(parent, selector) {
  const node = parent.querySelector(selector);
  return node ? node.textContent || "" : "";
}

function parseSiteXml(xmlText) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(xmlText, "application/xml");
  if (documentNode.querySelector("parsererror")) {
    throw new Error("XML invalido.");
  }

  const root = documentNode.querySelector("siteData");
  if (!root) {
    throw new Error("XML sem siteData.");
  }

  return normalizeSiteData({
    siteConfig: {
      contact: {
        email: getXmlText(root, "siteConfig > contact > email"),
        whatsapp: getXmlText(root, "siteConfig > contact > whatsapp"),
        instagram: getXmlText(root, "siteConfig > contact > instagram")
      },
      challengeForm: {
        endpoint: getXmlText(root, "siteConfig > challengeForm > endpoint"),
        accessKey: getXmlText(root, "siteConfig > challengeForm > accessKey"),
        successMessage: getXmlText(
          root,
          "siteConfig > challengeForm > successMessage"
        ),
        fallbackSubject: getXmlText(
          root,
          "siteConfig > challengeForm > fallbackSubject"
        ),
        fromName: getXmlText(root, "siteConfig > challengeForm > fromName"),
        subject: getXmlText(root, "siteConfig > challengeForm > subject")
      }
    },
    featuredProject: {
      title: getXmlText(root, "featuredProject > title"),
      format: getXmlText(root, "featuredProject > format"),
      genre: getXmlText(root, "featuredProject > genre"),
      logline: getXmlText(root, "featuredProject > logline"),
      status: getXmlText(root, "featuredProject > status"),
      audience: getXmlText(root, "featuredProject > audience")
    },
    projectGroups: Array.from(root.querySelectorAll("projectGroups > group")).map(
      (groupNode) => ({
        category: getXmlText(groupNode, "category"),
        items: Array.from(groupNode.querySelectorAll("items > item")).map(
          (itemNode) => ({
            title: getXmlText(itemNode, "title"),
            format: getXmlText(itemNode, "format"),
            genre: getXmlText(itemNode, "genre"),
            logline: getXmlText(itemNode, "logline"),
            status: getXmlText(itemNode, "status"),
            audience: getXmlText(itemNode, "audience")
          })
        )
      })
    )
  });
}

function buildSiteXml(data) {
  const normalized = normalizeSiteData(data);

  return `<?xml version="1.0" encoding="UTF-8"?>
<siteData>
  <siteConfig>
    <contact>
      <email>${escapeXml(normalized.siteConfig.contact.email)}</email>
      <whatsapp>${escapeXml(normalized.siteConfig.contact.whatsapp)}</whatsapp>
      <instagram>${escapeXml(normalized.siteConfig.contact.instagram)}</instagram>
    </contact>
    <challengeForm>
      <endpoint>${escapeXml(normalized.siteConfig.challengeForm.endpoint)}</endpoint>
      <accessKey>${escapeXml(normalized.siteConfig.challengeForm.accessKey)}</accessKey>
      <successMessage>${escapeXml(normalized.siteConfig.challengeForm.successMessage)}</successMessage>
      <fallbackSubject>${escapeXml(normalized.siteConfig.challengeForm.fallbackSubject)}</fallbackSubject>
      <fromName>${escapeXml(normalized.siteConfig.challengeForm.fromName)}</fromName>
      <subject>${escapeXml(normalized.siteConfig.challengeForm.subject)}</subject>
    </challengeForm>
  </siteConfig>
  <featuredProject>
    <title>${escapeXml(normalized.featuredProject.title)}</title>
    <format>${escapeXml(normalized.featuredProject.format)}</format>
    <genre>${escapeXml(normalized.featuredProject.genre)}</genre>
    <logline>${escapeXml(normalized.featuredProject.logline)}</logline>
    <status>${escapeXml(normalized.featuredProject.status)}</status>
    <audience>${escapeXml(normalized.featuredProject.audience)}</audience>
  </featuredProject>
  <projectGroups>
${normalized.projectGroups
  .map(
    (group) => `    <group>
      <category>${escapeXml(group.category)}</category>
      <items>
${group.items
  .map(
    (item) => `        <item>
          <title>${escapeXml(item.title)}</title>
          <format>${escapeXml(item.format)}</format>
          <genre>${escapeXml(item.genre)}</genre>
          <logline>${escapeXml(item.logline)}</logline>
          <status>${escapeXml(item.status)}</status>
          <audience>${escapeXml(item.audience)}</audience>
        </item>`
  )
  .join("\n")}
      </items>
    </group>`
  )
  .join("\n")}
  </projectGroups>
</siteData>
`;
}

async function fetchTextOrThrow(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/xml, text/xml, text/plain"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar ${url}`);
  }

  return response.text();
}

async function loadPublishedSiteXml() {
  return fetchTextOrThrow(CONTENT_API_PATH);
}

async function loadLatestPublishedBackupSiteData(adminPassword) {
  const response = await fetch(ADMIN_LATEST_BACKUP_API_PATH, {
    method: "GET",
    headers: {
      Accept: "application/xml, text/xml, text/plain, application/json",
      "x-admin-password": adminPassword
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = "Nao foi possivel carregar o backup publicado.";

    if (errorText) {
      try {
        const errorPayload = JSON.parse(errorText);
        if (errorPayload && errorPayload.error) {
          message = errorPayload.error;
        }
      } catch (error) {
        message = errorText;
      }
    }

    throw new Error(message);
  }

  const xmlText = await response.text();
  return parseSiteXml(xmlText);
}

async function loadPublishedSiteData() {
  try {
    const xmlText = await fetchTextOrThrow(CONTENT_API_PATH);
    return parseSiteXml(xmlText);
  } catch (apiError) {
    try {
      const xmlText = await fetchTextOrThrow(STATIC_CONTENT_XML_PATH);
      return parseSiteXml(xmlText);
    } catch (xmlError) {
      return normalizeSiteData(legacyDefaultSiteData);
    }
  }
}

async function loadStaticSiteData() {
  try {
    const xmlText = await fetchTextOrThrow(STATIC_CONTENT_XML_PATH);
    return parseSiteXml(xmlText);
  } catch (error) {
    console.error("Nao foi possivel carregar o XML base estatico.", error);
    return normalizeSiteData(legacyDefaultSiteData);
  }
}

function loadSiteData() {
  try {
    const raw = localStorage.getItem(SITE_STORAGE_KEY);
    if (!raw) {
      return normalizeSiteData(legacyDefaultSiteData);
    }

    return normalizeSiteData(JSON.parse(raw));
  } catch (error) {
    console.error("Nao foi possivel carregar os dados salvos.", error);
    return normalizeSiteData(legacyDefaultSiteData);
  }
}

function hasSavedSiteData() {
  try {
    return Boolean(localStorage.getItem(SITE_STORAGE_KEY));
  } catch (error) {
    console.error("Nao foi possivel verificar os dados salvos.", error);
    return false;
  }
}

function loadSiteBackups() {
  try {
    const raw = localStorage.getItem(SITE_BACKUP_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const backups = JSON.parse(raw);
    if (!Array.isArray(backups)) {
      return [];
    }

    return backups.filter((backup) => backup && backup.savedAt && backup.xml);
  } catch (error) {
    console.error("Nao foi possivel carregar os backups.", error);
    return [];
  }
}

function saveSiteBackup(data) {
  const xml = buildSiteXml(data);
  const nextBackups = [
    {
      savedAt: new Date().toISOString(),
      xml
    },
    ...loadSiteBackups()
  ].slice(0, MAX_SITE_BACKUPS);

  localStorage.setItem(SITE_BACKUP_STORAGE_KEY, JSON.stringify(nextBackups));
  return nextBackups;
}

function saveSiteData(data) {
  const normalized = normalizeSiteData(data);
  localStorage.setItem(SITE_STORAGE_KEY, JSON.stringify(normalized));
  saveSiteBackup(normalized);
  return normalized;
}

async function resetSiteData() {
  localStorage.removeItem(SITE_STORAGE_KEY);
  const staticData = await loadStaticSiteData();
  localStorage.setItem(SITE_STORAGE_KEY, JSON.stringify(staticData));
  return staticData;
}

function restoreLatestSiteBackup() {
  const [latestBackup] = loadSiteBackups();
  if (!latestBackup) {
    return null;
  }

  const restoredData = parseSiteXml(latestBackup.xml);
  localStorage.setItem(SITE_STORAGE_KEY, JSON.stringify(restoredData));
  return {
    savedAt: latestBackup.savedAt,
    data: restoredData
  };
}

async function savePublishedSiteData(data, adminPassword) {
  const xml = buildSiteXml(data);
  const response = await fetch(ADMIN_CONTENT_API_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      Accept: "application/json",
      "x-admin-password": adminPassword
    },
    body: xml
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = "Nao foi possivel publicar o XML.";

    if (errorText) {
      try {
        const errorPayload = JSON.parse(errorText);
        if (errorPayload && errorPayload.error) {
          message = errorPayload.error;
        }
      } catch (error) {
        message = errorText;
      }
    }

    throw new Error(message);
  }

  return {
    data: normalizeSiteData(data),
    xml
  };
}
