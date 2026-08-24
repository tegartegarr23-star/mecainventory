import type { AppData } from '../types'
import { now, recomputeStock, uid } from './inventory'

const STORAGE_KEY = 'mecamocha_inventory_v1'
const TOMBSTONE_KEY = 'mecamocha_deleted_trx_ids_v3'

const stamp = now()
const kitchen = { id: 'cat-kitchen', name: 'Kitchen', createdAt: stamp }
const bar = { id: 'cat-bar', name: 'Bar', createdAt: stamp }
const gram = { id: 'unit-g', name: 'Gram', abbreviation: 'g', createdAt: stamp }
const ml = { id: 'unit-ml', name: 'Millilitre', abbreviation: 'ml', createdAt: stamp }
const pcs = { id: 'unit-pcs', name: 'Pieces', abbreviation: 'pcs', createdAt: stamp }

export const demoData = (): AppData => {
  const sugar = 'ing-sugar', coffee = 'ing-coffee', milk = 'ing-milk', water = 'ing-water', syrup = 'ing-syrup'
  const initialId = 'tx-demo-opening'
  const ingredients = [
    { id: sugar, code: 'RAW-001', name: 'Gula Pasir', categoryId: kitchen.id, unitId: gram.id, type: 'raw' as const, minStock: 1000, currentStock: 0, costPerUnit: 18, cogsPerUnit: 18, isActive: true, createdAt: stamp },
    { id: coffee, code: 'RAW-002', name: 'Biji Kopi Arabika', categoryId: bar.id, unitId: gram.id, type: 'raw' as const, minStock: 500, currentStock: 0, costPerUnit: 260, cogsPerUnit: 260, isActive: true, createdAt: stamp },
    { id: milk, code: 'RAW-003', name: 'Susu UHT', categoryId: bar.id, unitId: ml.id, type: 'raw' as const, minStock: 1000, currentStock: 0, costPerUnit: 18, cogsPerUnit: 18, isActive: true, createdAt: stamp },
    { id: water, code: 'RAW-004', name: 'Air Mineral', categoryId: kitchen.id, unitId: ml.id, type: 'raw' as const, minStock: 2000, currentStock: 0, costPerUnit: 2, cogsPerUnit: 2, isActive: true, createdAt: stamp },
    { id: syrup, code: 'PRE-001', name: 'Simple Syrup', categoryId: bar.id, unitId: ml.id, type: 'prepared' as const, minStock: 300, currentStock: 0, costPerUnit: 0, cogsPerUnit: 20, isActive: true, createdAt: stamp },
  ]
  const movements = [
    [sugar, 5000], [coffee, 1500], [milk, 6000], [water, 10000],
  ].map(([ingredientId, quantity]) => ({ id: uid(), transactionId: initialId, ingredientId: String(ingredientId), transactionType: 'INIT' as const, direction: 'in' as const, quantity: Number(quantity), balanceAfter: 0, description: 'Stok awal demo', createdAt: stamp }))
  return recomputeStock({
    categories: [kitchen, bar], units: [gram, ml, pcs], suppliers: [{ id: 'sup-demo', name: 'PT Bahan Bahagia', contact: '0812-0000-0000', address: 'Jakarta', createdAt: stamp }], ingredients,
    menus: [{ id: 'menu-latte', name: 'Cafe Latte', category: 'Coffee', price: 28000, isActive: true, activeRecipeVersion: 1, createdAt: stamp }],
    recipes: [
      { id: 'recipe-latte', ownerType: 'menu', menuId: 'menu-latte', version: 1, isActive: true, yieldQuantity: 1, notes: 'Resep standar 1 gelas', createdAt: stamp, details: [{ id: uid(), ingredientId: coffee, quantity: 18 }, { id: uid(), ingredientId: milk, quantity: 180 }, { id: uid(), ingredientId: syrup, quantity: 15 }] },
      { id: 'recipe-syrup', ownerType: 'prepared', targetIngredientId: syrup, version: 1, isActive: true, yieldQuantity: 1000, notes: 'Hasil 1 liter', createdAt: stamp, details: [{ id: uid(), ingredientId: sugar, quantity: 1000 }, { id: uid(), ingredientId: water, quantity: 1000 }] },
    ],
    transactions: [{ id: initialId, type: 'INIT', transactionDate: new Date().toISOString().slice(0, 10), referenceNo: 'INIT-DEMO', notes: 'Data contoh — silakan hapus bila tidak diperlukan', createdAt: stamp }],
    movements, deletedTransactionIds: [],
  })
}

export function loadData(): AppData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return demoData()
    const parsed = JSON.parse(stored) as AppData
    const tombstones = JSON.parse(localStorage.getItem(TOMBSTONE_KEY) ?? '[]') as string[]
    parsed.deletedTransactionIds = [...new Set([...(parsed.deletedTransactionIds ?? []), ...tombstones])]
    parsed.transactions = parsed.transactions.filter((transaction) => !parsed.deletedTransactionIds.includes(transaction.id))
    parsed.movements = parsed.movements.filter((movement) => !parsed.deletedTransactionIds.includes(movement.transactionId))
    return recomputeStock(parsed)
  } catch { return demoData() }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(data.deletedTransactionIds))
}
