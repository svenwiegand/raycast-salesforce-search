export function mapToObject<Item, Value>(
    items: Item[],
    key: (item: Item) => string,
    value: (item: Item) => Value
): { [key in string]: Value } {
    return items.reduce(
        (result, item) => ({...result, ...{[key(item)]: value(item)}}),
        {},
    )
}