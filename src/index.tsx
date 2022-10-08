import { ActionPanel, Action, List } from "@raycast/api";
import { usePromise, Response } from "@raycast/utils";
import { useEffect, useState } from "react";
import { URLSearchParams } from "node:url";
import { find, SalesforceRecord } from "./salesforce";

export default function Command() {
  const [query, setQuery] = useState("")
  const { isLoading, data, revalidate } = usePromise(
    find, [query]
  )

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search Salesforce"
      throttle
    >
      <List.Section title="Results" subtitle={data?.length + ""}>
        {data?.map((record) => (
          <SearchListItem key={record.id} record={record} />
        ))}
      </List.Section>
    </List>
  );
}

function SearchListItem({ record }: { record: SalesforceRecord }) {
  return (
    <List.Item
      title={record.name}
      subtitle={record.type}
      icon={record.iconUrl ? { source: record.iconUrl } : undefined}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.OpenInBrowser title="Open in Browser" url={record.url} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

/** Parse the response from the fetch query into something we can display */
async function parseFetchResponse(response: Response) {
  const json = (await response.json()) as
    | {
        results: {
          package: {
            name: string;
            description?: string;
            publisher?: { username: string };
            links: { npm: string };
          };
        }[];
      }
    | { code: string; message: string };

  if (!response.ok || "message" in json) {
    throw new Error("message" in json ? json.message : response.statusText);
  }

  return json.results.map((result) => {
    return {
      name: result.package.name,
      description: result.package.description,
      username: result.package.publisher?.username,
      url: result.package.links.npm,
    } as SearchResult;
  });
}

interface SearchResult {
  name: string;
  description?: string;
  username?: string;
  url: string;
}
