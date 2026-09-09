import geoip from "geoip-lite"
import countries from "i18n-iso-countries"
import enLocale from "i18n-iso-countries/langs/en.json"

countries.registerLocale(enLocale)

// i18n-iso-countries returns formal ISO short names (e.g. "Russian Federation",
// "United States of America") for some codes. These overrides keep the output
// aligned with the common names used in the frontend's country dropdown.
const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
    BN: "Brunei",
    CV: "Cabo Verde",
    CN: "China",
    CG: "Congo",
    CZ: "Czechia",
    GM: "Gambia",
    IR: "Iran",
    LA: "Laos",
    FM: "Micronesia",
    MD: "Moldova",
    MK: "North Macedonia",
    PS: "Palestine",
    RU: "Russia",
    SY: "Syria",
    TW: "Taiwan",
    TZ: "Tanzania",
    TR: "Turkey",
    US: "United States",
}

export const getCountryFromIp = (ip?: string | null): string | undefined => {
    if (!ip) return undefined

    const normalizedIp = ip.startsWith("::ffff:") ? ip.substring(7) : ip

    const geo = geoip.lookup(normalizedIp)
    if (!geo?.country) return undefined

    return COUNTRY_NAME_OVERRIDES[geo.country] ?? countries.getName(geo.country, "en")
}
