import fetch, { FetchError, FormData } from "node-fetch"
import { LocalStorage, getPreferenceValues } from "@raycast/api"
import { log } from "./log"

export interface SfRecord {
    attributes: { 
        type: string 
        url: string 
    }
    Name: string
    Id: string
}

export interface SearchResult<T> {
    searchRecords: T[]
}

const prefs = getPreferenceValues()
const accessTokenStorage = "accessToken"

async function requestAccessToken(): Promise<string | never> {
    try {
        log("login")
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
        LocalStorage.setItem(accessTokenStorage, accessToken)
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
    const token = await LocalStorage.getItem<string>(accessTokenStorage)
    return token ?? requestAccessToken()
}

async function invalidateAccessToken() {
    LocalStorage.removeItem(accessTokenStorage)
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
        invalidateAccessToken()
        return get(urlPath, params)
    } else if (response.status >= 400) {
        log(response.status)
        log(await response.text())
        throw Error(`Request failed with status code ${response.status}`)
    } else {
        return await response.json() as T
    }
}

export async function find(query: string): Promise<SfRecord[]> {
    if (query.length < 3) return []
    const q = `FIND {${query}} IN NAME FIELDS RETURNING Account(id, name), Asset(id, name), Contact(id, name), Opportunity(id, name) LIMIT 20`
    const result = await get<SearchResult<SfRecord>>("/services/data/v55.0/search/", { q })
    log(result)
    return result.searchRecords
}