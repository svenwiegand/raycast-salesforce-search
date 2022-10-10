import { Action, ActionPanel, Icon, Image, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { Key, useState } from "react";
import { find, getObjects, SfObject, SfRecord } from "./salesforce-api";

export default function Command() {
  const [query, setQuery] = useState("")
  const [filterObjectName, setFilterObjectName] = useState<string | undefined>(undefined)
  const { data: objects } = usePromise(getObjects, [])
  const { isLoading, data: records } = usePromise(find, [query, (filterObjectName && filterObjectName !== "") ? filterObjectName : undefined])

  const sections = records && objects ? recordSections(records, objects) : undefined
  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search Salesforce"
      searchBarAccessory={<FilterList objects={objects} onChange={setFilterObjectName}/>}
      throttle
    >
      {sections?.map(section =>
        <List.Section key={section.object.apiName} title={section.object?.labelPlural}>
          {section?.records?.map((record) => (
            <RecordItem key={record.id} record={record} object={section.object} />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function FilterList({ objects, onChange }: { objects?: SfObject[], onChange: (objectApiName: string) => void }) {
  const objectsSortedByLabel = objects?.sort((a, b) => a.labelPlural.localeCompare(b.labelPlural))
  return (
    <List.Dropdown
      tooltip="Filter by object"
      storeValue={true}
      onChange={onChange}>
      <List.Dropdown.Item title="All object types" value="" icon={Icon.StarCircle} />
      {objectsSortedByLabel?.map(obj => <FilterItem key={obj.apiName} object={obj} />)}
    </List.Dropdown>
  )
}

function FilterItem({ object }: { object: SfObject }) {
  return (
    <List.Dropdown.Item
      title={object.labelPlural}
      value={object.apiName}
      icon={{
        source: object.iconUrl,
        tintColor: object.iconColor,
      }}
    />
  )
}

function RecordItem({ record, object }: { record: SfRecord, object?: SfObject }) {
  return (
    <List.Item
      title={record.name}
      subtitle={object?.label}
      icon={object ? {
        source: object.iconUrl,
        tintColor: object.iconColor,
      } : undefined}
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

function recordSections(records: SfRecord[], objects: SfObject[]): { object: SfObject, records: SfRecord[] }[] {
  const sectionKeys = keysOf(records, rec => rec.objectApiName)
  const sections = sectionKeys.map(key => ({
    object: objects.find(o => o.apiName === key)!,
    records: records.filter(r => r.objectApiName === key)
  }))
  const sorted = sections.sort((a, b) => a.object.apiName.localeCompare(b.object.apiName))
  return sorted
}

function keysOf<Item, Key>(items: Item[], keyOf: (item: Item) => Key): Key[] {
  const set = items.reduce(
    (set: Set<Key>, item: Item) => set.add(keyOf(item)),
    new Set()
  )
  return Array.from(set)
}