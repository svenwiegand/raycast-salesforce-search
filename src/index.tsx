import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { find, getObjects, SfObject, SfRecord } from "./salesforce";

export default function Command() {
  const [query, setQuery] = useState("")
  const [filterObjectName, setFilterObjectName] = useState<string | undefined>(undefined)
  const { data: objects } = usePromise(getObjects, [])
  const { isLoading, data: records } = usePromise(find, [query, (filterObjectName && filterObjectName !== "") ? filterObjectName : undefined])

  const objectByName = group(objects, obj => obj.apiName)
  const filterList =
    <List.Dropdown
      tooltip="Filter by object"
      storeValue={true}
      onChange={setFilterObjectName}>
        <List.Dropdown.Item title="All object types" value="" icon={Icon.StarCircle} />
        {objects?.map(obj => <FilterItem key={obj.apiName} object={obj}/>)}
    </List.Dropdown>

  const recordsByObject = group(records, r => r.objectApiName)
  const sections = recordsByObject ? Array.from(recordsByObject?.keys(), apiName => ({ 
    apiName, 
    object: objectByName?.get(apiName)?.[0],
    records: recordsByObject?.get(apiName)
  })) : undefined
  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search Salesforce"
      searchBarAccessory={filterList}
      throttle
    >
      {sections?.map(section =>
        <List.Section key={section.apiName} title={section.object?.labelPlural}>
          {section?.records?.map((record) => (
            <RecordItem key={record.id} record={record} object={objectByName?.get(record.objectApiName)?.[0]} />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function FilterItem({ object }: { object: SfObject }) {
  return (
    <List.Dropdown.Item
      title={object.labelPlural}
      value={object.apiName}
      icon={object.iconUrl}
    />
  )
}

function RecordItem({ record, object }: { record: SfRecord, object?: SfObject }) {
  return (
    <List.Item
      title={record.name}
      subtitle={object?.label}
      icon={object?.iconUrl}
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

function group<T, Key>(items: T[] | undefined, keyOf: (item: T) => Key): Map<Key, T[]> | undefined {
  if (items) {
    return items?.reduce(
      (map: Map<Key, T[]>, item: T) => map.set(keyOf(item), [...map.get(keyOf(item)) || [], item]),
      new Map()
    )
  } else {
    return undefined
  }
}