import fetch, { FormData } from "node-fetch"
import { getPreferenceValues, OAuth } from "@raycast/api"
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
const oauthClient = new OAuth.PKCEClient({
    redirectMethod: OAuth.RedirectMethod.Web,
    providerName: "Salesforce",
    providerIcon: "salesforce.png",
    description: "Connect your Salesforce account …",
})

interface RequestTokenWithCode {
    grantType: "authorization_code"
    authRequest: OAuth.AuthorizationRequest
    authorizationCode: string
}
interface RequestTokenWithRefreshToken {
    grantType: "refresh_token"
    refreshToken: string
}
async function requestTokens(options: RequestTokenWithCode | RequestTokenWithRefreshToken): Promise<string> {
    log(`requesting token using grantType ${options.grantType}`)
    const url = `https://login.salesforce.com/services/oauth2/token`
    const form = new FormData()
    form.append("grant_type", options.grantType)
    form.append("client_id", prefs.clientId)
    if (options.grantType === "authorization_code") {
        form.append("code", options.authorizationCode)
        form.append("code_verifier", options.authRequest.codeVerifier)
        form.append("redirect_uri", options.authRequest.redirectURI)
    } else {
        form.append("refresh_token", options.refreshToken)
    }
    const response = await fetch(url, {
        method: "POST",
        body: form,
    })
    const tokenSet = (await response.json()) as OAuth.TokenResponse
    log(tokenSet)
    oauthClient.setTokens(tokenSet)
    return tokenSet.access_token
}

async function login(): Promise<string> {
    log("oauthLogin")
    const authRequest = await oauthClient.authorizationRequest({
        endpoint: `https://${domain}.my.salesforce.com/services/oauth2/authorize`,
        clientId: prefs.clientId,
        scope: "refresh_token api",
    })
    const { authorizationCode } = await oauthClient.authorize(authRequest)
    return requestTokens({grantType: "authorization_code", authRequest, authorizationCode})
}

async function accessToken(refresh?: boolean): Promise<string> {
    const tokenSet = await oauthClient.getTokens()
    if (!refresh && tokenSet?.accessToken && !tokenSet.isExpired()) {
        return tokenSet.accessToken
    } else if (tokenSet?.refreshToken) {
        return requestTokens({ grantType: "refresh_token", refreshToken: tokenSet.refreshToken })
    } else {
        return login()
    }
}

async function refreshToken(): Promise<string> {
    return accessToken(true)
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
        await refreshToken()
        return get(urlPath, params)
    } if (response.status >= 400) {
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
    return result.results.map(r => ({
        apiName: r.result.apiName,
        label: r.result.label,
        labelPlural: r.result.labelPlural,
        iconUrl: r.result.themeInfo.iconUrl,
        iconColor: r.result.themeInfo.color,
    }))
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