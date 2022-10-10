import fetch, { FetchError, FormData } from "node-fetch"
import { LocalStorage, getPreferenceValues } from "@raycast/api"
import { log } from "./log"

interface Attributes {
    type: string
    url: string
}

export interface SfObject {
    apiName: string
    label: string
    labelPlural: string
    iconUrl: string
    iconColor: string
}

export interface SfRecord {
    id: string
    objectApiName: string
    name: string
    url: string
}

const prefs = getPreferenceValues()
const domain = prefs.domain as string
const additionalObjects = prefs.additionalObjects ? (prefs.additionalObjects as string).split(",").map(s => s.trim()) : []
const objects = ['Account', 'Contact', 'Opportunity', ... additionalObjects]
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
    const url = new URL(path, `https://${domain}.my.salesforce.com`).toString()
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

export async function getObjects(): Promise<SfObject[]> {
    interface Result {
        results: {
            result: {
                apiName: string
                label: string
                labelPlural: string
                themeInfo: {
                    iconUrl: string
                    color: string
                }
            }
        }[]
    }

    const objNames = objects.join(",")
    const result = await get<Result>(`/services/data/v54.0/ui-api/object-info/batch/${objNames}`)
    const objs = result.results.map(r => ({
        apiName: r.result.apiName,
        label: r.result.label,
        labelPlural: r.result.labelPlural,
        iconUrl: r.result.themeInfo.iconUrl,
        iconColor: r.result.themeInfo.color,
    }))
    return objs
}

export async function find(query: string, filterObjectName?: string): Promise<SfRecord[]> {
    interface Result {
        searchRecords: {
            attributes: Attributes
            Name: string
            Id: string
        }[]
    }

    if (query.length < 3) return []
    const sanitizedQuery = query.replaceAll(/([?&|!{}[\]()^~*:\\"'+-])/g, "\\$1")
    log(sanitizedQuery)
    const objs = filterObjectName ? [filterObjectName] : objects
    const objFields = objs.map(obj => `${obj}(id, name)`).join(", ")
    const q = `FIND {${sanitizedQuery}} IN ALL FIELDS RETURNING ${objFields} LIMIT 20`
    const records = await get<Result>("/services/data/v55.0/search/", { q })
    return records.searchRecords.map(r => ({ 
        id: r.Id, 
        objectApiName: r.attributes.type,
        name: r.Name, 
        url: `https://${domain}.lightning.force.com/lightning/r/${r.attributes.type}/${r.Id}/view`, 
    }) as SfRecord)
}