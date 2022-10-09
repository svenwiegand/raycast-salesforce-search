import fetch, { FetchError, FormData } from "node-fetch"
import { LocalStorage, getPreferenceValues } from "@raycast/api"
import { log } from "./log"

interface Attributes {
    type: string
    url: string
}

interface SfRecord {
    attributes: Attributes
    Name: string
    Id: string
}

interface IconRecord {
    attributes: Attributes
    TabDefinitionId: string
    Url: string
    ContentType: string
    Height: number
}

interface ObjectIconUrls {
    attributes: Attributes
    Icons: {
        records: IconRecord[]
    }
}

interface QueryResult<T> {
    records: T[]
}

interface SearchResult<T> {
    searchRecords: T[]
}

export interface SalesforceRecord {
    id: string
    type: string
    name: string
    url: string
    iconUrl?: string
}

const prefs = getPreferenceValues()
const objects = ['Account', 'Contact', 'Opportunity']
const storage = {
    accessToken: "accessToken",
    icon: (obj: string) => `icon${obj}`,
}

async function login(): Promise<string | never> {
    try {
        log("login")
        LocalStorage.clear()
        const url = `https://login.salesforce.com/services/oauth2/token`
        const form = new FormData()
        form.append("grant_type", "password")
        form.append("client_id", prefs.clientId)
        form.append("client_secret", prefs.clientSecret)
        form.append("username", prefs.username)
        form.append("password", prefs.password + prefs.securityToken)
        const response = await fetch(url, {
            method: "POST",
            body: form,
        })
        const json = await response.json() as any
        const accessToken = json.access_token
        if (!accessToken) throw Error("Login failed")
        log(accessToken)
        await LocalStorage.setItem(storage.accessToken, accessToken)
        storeIconUrls()
        return accessToken
    }
    catch (error) {
        if (error instanceof FetchError)
            throw Error("Check your network connection")
        else
            throw error
    }
}

async function accessToken(): Promise<string | never> {
    const token = await LocalStorage.getItem<string>(storage.accessToken)
    return token ?? login()
}

function apiUrl(path: string, queryParams?: { [key: string]: any }): string {
    const url = new URL(path, `https://${prefs.domain}.my.salesforce.com`).toString()
    const params = new URLSearchParams(queryParams).toString()
    return url + (params.length > 0 ? `?${params}` : "")
}

async function get<T>(urlPath: string, params?: { [key: string]: any }): Promise<T> {
    const response = await fetch(apiUrl(urlPath, params), {
        method: "GET",
        headers: {
            Authorization: `Bearer ${await accessToken()}`
        }
    })
    if (response.status === 401) {
        await login()
        return get(urlPath, params)
    } else if (response.status >= 400) {
        log(response.status)
        log(await response.text())
        throw Error(`Request failed with status code ${response.status}`)
    } else {
        return await response.json() as T
    }
}

async function storeIconUrls() {
    const objs = objects.map(obj => `'${obj}'`).join(", ")
    const q = `SELECT (SELECT FIELDS(ALL) FROM Icons LIMIT 200) FROM TabDefinition where SobjectName IN (${objs})`
    const result = await get<QueryResult<ObjectIconUrls>>("/services/data/v55.0/query/", { q })
    result.records.forEach(obj => {
        const icon = obj.Icons.records.find((icon) => icon.ContentType === "image/svg+xml")
        if (icon) {
            LocalStorage.setItem(storage.icon(icon.TabDefinitionId), icon.Url)
        }
    })
}

export async function find(query: string): Promise<SalesforceRecord[]> {
    if (query.length < 3) return []
    const objFields = objects.map(obj => `${obj}(id, name)`).join(", ")
    const q = `FIND {${query}} IN NAME FIELDS RETURNING ${objFields} LIMIT 20`
    const records = await get<SearchResult<SfRecord>>("/services/data/v55.0/search/", { q })
    const result = records.searchRecords.map(async (r) => ({ 
        id: r.Id, 
        type: r.attributes.type,
        name: r.Name, 
        url: r.attributes.url, 
        iconUrl: await LocalStorage.getItem<string>(storage.icon(r.attributes.type))
    }))
    return Promise.all(result)
}