import type { AppData } from '../types'
import { now, recomputeStock } from './inventory'

const STORAGE_KEY = 'mecamocha_inventory_v1'
const TOMBSTONE_KEY = 'mecamocha_deleted_trx_ids_v3'

const stamp = now()
const kitchen = { id: 'cat-kitchen', name: 'Kitchen', createdAt: stamp }
const bar = { id: 'cat-bar', name: 'Bar', createdAt: stamp }
const gram = { id: 'unit-g', name: 'Gram', abbreviation: 'g', createdAt: stamp }
const ml = { id: 'unit-ml', name: 'Millilitre', abbreviation: 'ml', createdAt: stamp }
const pcs = { id: 'unit-pcs', name: 'Pieces', abbreviation: 'pcs', createdAt: stamp }

export const emptyData = (): AppData => recomputeStock({
  categories: [kitchen, bar], units: [gram, ml, pcs], suppliers: [], ingredients: [], menus: [], recipes: [], transactions: [], movements: [], deletedTransactionIds: [],
})

export function loadData(): AppData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return emptyData()
    const parsed = JSON.parse(stored) as AppData
    const tombstones = JSON.parse(localStorage.getItem(TOMBSTONE_KEY) ?? '[]') as string[]
    parsed.deletedTransactionIds = [...new Set([...(parsed.deletedTransactionIds ?? []), ...tombstones])]
    parsed.transactions = parsed.transactions.filter((transaction) => !parsed.deletedTransactionIds.includes(transaction.id))
    parsed.movements = parsed.movements.filter((movement) => !parsed.deletedTransactionIds.includes(movement.transactionId))
    return recomputeStock(parsed)
  } catch { return emptyData() }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(data.deletedTransactionIds))
}
