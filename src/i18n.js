// -----------------------------------------------------------------------------
// User-facing texts, in the four languages of the Gladys UI.
//
// Every text the integration sends to Gladys (action answers, toasts, widget
// labels, connection status) is a multi-language object `{ en, fr, de, es }`:
// Gladys picks the user's language and falls back to `en`. Keep the four
// languages in sync when adding a key (test/i18n.test.js checks it).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

const MESSAGES = {
  // --- Connection status / test action -------------------------------------
  nothing_configured: {
    en: 'No inverter found yet: enter its IP address, enable the network scan or a SEMS account.',
    fr: 'Aucun onduleur trouvé : saisissez son adresse IP, activez la recherche réseau ou un compte SEMS.',
    de: 'Noch kein Wechselrichter gefunden: IP-Adresse eingeben, Netzwerksuche oder SEMS-Konto aktivieren.',
    es: 'Ningún inversor encontrado: introduzca su IP, active la búsqueda en red o una cuenta SEMS.',
  },
  init_failed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, bitte die Integrationsprotokolle prüfen.',
    es: 'La inicialización falló, consulte los registros de la integración.',
  },
  sems_auth_failed: {
    en: 'SEMS login refused: check the e-mail address and password of your SEMS account.',
    fr: 'Connexion SEMS refusée : vérifiez l’adresse e-mail et le mot de passe de votre compte SEMS.',
    de: 'SEMS-Anmeldung abgelehnt: E-Mail-Adresse und Passwort des SEMS-Kontos prüfen.',
    es: 'Inicio de sesión SEMS rechazado: compruebe el correo y la contraseña de su cuenta SEMS.',
  },
  sems_rate_limited: {
    en: 'The SEMS portal asks to slow down: new attempt in 5 minutes.',
    fr: 'Le portail SEMS demande de ralentir : nouvel essai dans 5 minutes.',
    de: 'Das SEMS-Portal verlangt eine Pause: neuer Versuch in 5 Minuten.',
    es: 'El portal SEMS pide reducir el ritmo: nuevo intento en 5 minutos.',
  },
  sems_unreachable: {
    en: 'The SEMS portal cannot be reached for now.',
    fr: 'Le portail SEMS est injoignable pour le moment.',
    de: 'Das SEMS-Portal ist derzeit nicht erreichbar.',
    es: 'El portal SEMS no está accesible por ahora.',
  },
  test_local_ok: {
    en: '{host}: {model} found (S/N {serial}).',
    fr: '{host} : {model} trouvé (N/S {serial}).',
    de: '{host}: {model} gefunden (S/N {serial}).',
    es: '{host}: {model} encontrado (N/S {serial}).',
  },
  test_local_failed: {
    en: '{host}: no GoodWe answer on UDP port 8899.',
    fr: '{host} : aucune réponse GoodWe sur le port UDP 8899.',
    de: '{host}: keine GoodWe-Antwort auf UDP-Port 8899.',
    es: '{host}: sin respuesta GoodWe en el puerto UDP 8899.',
  },
  test_cloud_ok: {
    en: 'SEMS: connected, {stations} plant(s), {inverters} inverter(s).',
    fr: 'SEMS : connecté, {stations} centrale(s), {inverters} onduleur(s).',
    de: 'SEMS: verbunden, {stations} Anlage(n), {inverters} Wechselrichter.',
    es: 'SEMS: conectado, {stations} planta(s), {inverters} inversor(es).',
  },
  test_scan: {
    en: 'Network scan: {count} GoodWe dongle(s) answered.',
    fr: 'Recherche réseau : {count} module(s) GoodWe ont répondu.',
    de: 'Netzwerksuche: {count} GoodWe-Modul(e) haben geantwortet.',
    es: 'Búsqueda en red: {count} módulo(s) GoodWe respondieron.',
  },
  // --- Transport badge -----------------------------------------------------
  local_unreachable_cloud_fallback: {
    en: 'Local connection lost, data from the SEMS portal (slower, less detailed).',
    fr: 'Connexion locale perdue, données du portail SEMS (plus lentes, moins détaillées).',
    de: 'Lokale Verbindung verloren, Daten aus dem SEMS-Portal (langsamer, weniger detailliert).',
    es: 'Conexión local perdida, datos del portal SEMS (más lentos, menos detallados).',
  },
  // --- Scene actions / widget toasts ---------------------------------------
  action_done: {
    en: 'Done.',
    fr: 'C’est fait.',
    de: 'Erledigt.',
    es: 'Hecho.',
  },
  unknown_device: {
    en: 'Unknown GoodWe inverter: run a scan from the Discovery tab.',
    fr: "Onduleur GoodWe inconnu : lancez une recherche depuis l'onglet Découverte.",
    de: 'Unbekannter GoodWe-Wechselrichter: Suche im Tab „Erkennung“ starten.',
    es: 'Inversor GoodWe desconocido: inicie una búsqueda en la pestaña Descubrimiento.',
  },
  needs_local: {
    en: 'This setting needs the local connection to the inverter (UDP 8899).',
    fr: "Ce réglage nécessite la connexion locale à l'onduleur (UDP 8899).",
    de: 'Diese Einstellung erfordert die lokale Verbindung zum Wechselrichter (UDP 8899).',
    es: 'Este ajuste requiere la conexión local al inversor (UDP 8899).',
  },
  unsupported: {
    en: 'Not supported by this inverter: {reason}',
    fr: 'Non pris en charge par cet onduleur : {reason}',
    de: 'Von diesem Wechselrichter nicht unterstützt: {reason}',
    es: 'No compatible con este inversor: {reason}',
  },
  refreshed: {
    en: 'Values refreshed.',
    fr: 'Valeurs actualisées.',
    de: 'Werte aktualisiert.',
    es: 'Valores actualizados.',
  },
  refresh_failed: {
    en: 'The inverter did not answer.',
    fr: "L'onduleur n'a pas répondu.",
    de: 'Der Wechselrichter hat nicht geantwortet.',
    es: 'El inversor no respondió.',
  },
  // --- Widget labels -------------------------------------------------------
  w_production: { en: 'Solar', fr: 'Solaire', de: 'Solar', es: 'Solar' },
  w_consumption: { en: 'House', fr: 'Maison', de: 'Haus', es: 'Casa' },
  w_grid: { en: 'Grid', fr: 'Réseau', de: 'Netz', es: 'Red' },
  w_battery: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  w_today: {
    en: 'Produced today',
    fr: "Produit aujourd'hui",
    de: 'Heute erzeugt',
    es: 'Producido hoy',
  },
  w_state: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  w_connection: { en: 'Connection', fr: 'Connexion', de: 'Verbindung', es: 'Conexión' },
  w_flow: { en: 'Grid exchange', fr: 'Échange réseau', de: 'Netzaustausch', es: 'Intercambio red' },
  w_importing: { en: 'Importing', fr: 'Soutirage', de: 'Bezug', es: 'Importando' },
  w_exporting: { en: 'Exporting', fr: 'Injection', de: 'Einspeisung', es: 'Exportando' },
  w_balanced: { en: 'Balanced', fr: 'Équilibré', de: 'Ausgeglichen', es: 'Equilibrado' },
  w_refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  w_pick_device: {
    en: 'Pick a GoodWe inverter in the widget settings.',
    fr: 'Choisissez un onduleur GoodWe dans les réglages du widget.',
    de: 'Einen GoodWe-Wechselrichter in den Widget-Einstellungen wählen.',
    es: 'Elija un inversor GoodWe en los ajustes del widget.',
  },
  w_chart_title: {
    en: 'Production and consumption',
    fr: 'Production et consommation',
    de: 'Erzeugung und Verbrauch',
    es: 'Producción y consumo',
  },
  w_self_sufficiency: {
    en: 'Self-sufficiency',
    fr: 'Autonomie',
    de: 'Autarkie',
    es: 'Autosuficiencia',
  },
  w_imported_today: {
    en: 'Imported today',
    fr: "Soutiré aujourd'hui",
    de: 'Heute bezogen',
    es: 'Importado hoy',
  },
  w_exported_today: {
    en: 'Exported today',
    fr: "Injecté aujourd'hui",
    de: 'Heute eingespeist',
    es: 'Exportado hoy',
  },
  // --- Inverter states / transports ----------------------------------------
  state_waiting: { en: 'Waiting', fr: 'En attente', de: 'Wartend', es: 'En espera' },
  state_normal: { en: 'Producing', fr: 'En production', de: 'In Betrieb', es: 'Produciendo' },
  'state_off-grid': { en: 'Off-grid', fr: 'Hors réseau', de: 'Inselbetrieb', es: 'Aislado' },
  state_fault: { en: 'Fault', fr: 'En défaut', de: 'Störung', es: 'Avería' },
  state_checking: { en: 'Self-check', fr: 'Autotest', de: 'Selbsttest', es: 'Autotest' },
  state_unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  transport_local: { en: 'Local', fr: 'Locale', de: 'Lokal', es: 'Local' },
  transport_cloud: { en: 'SEMS cloud', fr: 'Cloud SEMS', de: 'SEMS-Cloud', es: 'Nube SEMS' },
  transport_unreachable: {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },
};

/**
 * The multi-language text of `key`, with `{name}` placeholders replaced.
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 */
export function t(key, vars = {}) {
  const message = MESSAGES[key];
  if (!message) {
    throw new Error(`Unknown message "${key}"`);
  }
  const result = {};
  for (const lang of LANGUAGES) {
    result[lang] = message[lang].replace(/\{(\w+)\}/g, (match, name) =>
      vars[name] === undefined ? match : String(vars[name]),
    );
  }
  return result;
}

/** Join several multi-language texts line by line, language per language. */
export function joinLines(texts) {
  const result = {};
  for (const lang of LANGUAGES) {
    result[lang] = texts.map((text) => text[lang]).join('\n');
  }
  return result;
}

export const MESSAGE_KEYS = Object.keys(MESSAGES);
