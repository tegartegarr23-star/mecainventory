import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AppData, Recipe, StockMovement } from '../types'

const env = import.meta.env as ImportMetaEnv & {
  NEXT_PUBLIC_SUPABASE_URL?: string
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string
}
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.VITE_SUPABASE_URL
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY
export const cloudEnabled = Boolean(url && key)
export const supabase: SupabaseClient | null = cloudEnabled ? createClient(url!, key!) : null

const toIso = (date: string) => date.includes('T') ? date : `${date}T00:00:00.000Z`

export async function pushSnapshot(data: AppData): Promise<string> {
  if (!supabase) return 'Mode lokal aktif — isi .env.local untuk menghubungkan Supabase.'
  const recipeRows = data.recipes.map((recipe) => ({
    id: recipe.id, owner_type: recipe.ownerType, menu_id: recipe.menuId ?? null, target_ingredient_id: recipe.targetIngredientId ?? null,
    version: recipe.version, is_active: recipe.isActive, yield_quantity: recipe.yieldQuantity, notes: recipe.notes, created_at: recipe.createdAt,
  }))
  const detailRows = data.recipes.flatMap((recipe) => recipe.details.map((detail) => ({ id: detail.id, recipe_id: recipe.id, ingredient_id: detail.ingredientId, quantity: detail.quantity })))
  const transactionRows = data.transactions.map((transaction) => ({
    id: transaction.id, type: transaction.type.toLowerCase(), transaction_at: toIso(transaction.transactionDate), reference_no: transaction.referenceNo, notes: transaction.notes,
    supplier_id: transaction.supplierId ?? null, adjustment_reason: transaction.adjustmentReason ?? null, created_at: transaction.createdAt,
  }))
  const menuSaleRows = data.transactions.flatMap((transaction) => (transaction.menuSales ?? []).map((sale) => ({ transaction_id: transaction.id, menu_id: sale.menuId, portions: sale.portions })))
  const movementRows = data.movements.map((movement: StockMovement) => ({
    id: movement.id, transaction_id: movement.transactionId, ingredient_id: movement.ingredientId, direction: movement.direction,
    quantity: movement.quantity, balance_after: movement.balanceAfter, description: movement.description, created_at: movement.createdAt,
  }))
  const operations = [
    supabase.from('categories').upsert(data.categories.map((item) => ({ id: item.id, name: item.name, created_at: item.createdAt }))),
    supabase.from('units').upsert(data.units.map((item) => ({ id: item.id, name: item.name, abbreviation: item.abbreviation, created_at: item.createdAt }))),
    supabase.from('suppliers').upsert(data.suppliers.map((item) => ({ id: item.id, name: item.name, contact: item.contact, address: item.address, created_at: item.createdAt }))),
    supabase.from('ingredients').upsert(data.ingredients.map((item) => ({ id: item.id, code: item.code, name: item.name, category_id: item.categoryId, unit_id: item.unitId, type: item.type, min_stock: item.minStock, current_stock: item.currentStock, cost_per_unit: item.costPerUnit, cogs_per_unit: item.cogsPerUnit, is_active: item.isActive, created_at: item.createdAt }))),
    supabase.from('menus').upsert(data.menus.map((item) => ({ id: item.id, name: item.name, category: item.category, price: item.price, is_active: item.isActive, active_recipe_version: item.activeRecipeVersion, created_at: item.createdAt }))),
    supabase.from('recipes').upsert(recipeRows),
    supabase.from('recipe_details').upsert(detailRows),
    supabase.from('inventory_transactions').upsert(transactionRows),
    supabase.from('menu_sales').upsert(menuSaleRows, { onConflict: 'transaction_id,menu_id' }),
    supabase.from('stock_movements').upsert(movementRows),
    supabase.from('transaction_tombstones').upsert(data.deletedTransactionIds.map((transactionId) => ({ transaction_id: transactionId }))),
  ]
  const settled = await Promise.all(operations)
  const failure = settled.find((result) => result.error)?.error
  if (failure) throw failure
  return `Tersinkron ke Supabase pada ${new Date().toLocaleTimeString('id-ID')}.`
}

export async function pullSnapshot(local: AppData): Promise<AppData | null> {
  if (!supabase) return null
  const [categories, units, suppliers, ingredients, menus, recipes, details, transactions, menuSales, movements, tombstones] = await Promise.all([
    supabase.from('categories').select('*'), supabase.from('units').select('*'), supabase.from('suppliers').select('*'), supabase.from('ingredients').select('*'),
    supabase.from('menus').select('*'), supabase.from('recipes').select('*'), supabase.from('recipe_details').select('*'), supabase.from('inventory_transactions').select('*'),
    supabase.from('menu_sales').select('*'), supabase.from('stock_movements').select('*'), supabase.from('transaction_tombstones').select('transaction_id'),
  ])
  const all = [categories, units, suppliers, ingredients, menus, recipes, details, transactions, menuSales, movements, tombstones]
  const failure = all.find((result) => result.error)?.error
  if (failure) throw failure
  if (!ingredients.data?.length && !transactions.data?.length) return null
  const deletedIds = [...new Set([...local.deletedTransactionIds, ...(tombstones.data ?? []).map((item) => item.transaction_id)])]
  const recipeDetails = details.data ?? []
  const recipesLocal: Recipe[] = (recipes.data ?? []).map((item) => ({
    id: item.id, ownerType: item.owner_type, menuId: item.menu_id ?? undefined, targetIngredientId: item.target_ingredient_id ?? undefined, version: item.version, isActive: item.is_active,
    yieldQuantity: Number(item.yield_quantity), notes: item.notes ?? '', createdAt: item.created_at,
    details: recipeDetails.filter((detail) => detail.recipe_id === item.id).map((detail) => ({ id: detail.id, ingredientId: detail.ingredient_id, quantity: Number(detail.quantity) })),
  }))
  const remoteTransactions = (transactions.data ?? []).filter((item) => !deletedIds.includes(item.id)).map((item) => ({ id: item.id, type: String(item.type).toUpperCase() as AppData['transactions'][number]['type'], transactionDate: String(item.transaction_at).slice(0, 10), referenceNo: item.reference_no, notes: item.notes ?? '', supplierId: item.supplier_id ?? undefined, adjustmentReason: item.adjustment_reason ?? undefined, menuSales: (menuSales.data ?? []).filter((sale) => sale.transaction_id === item.id).map((sale) => ({ menuId: sale.menu_id, portions: Number(sale.portions) })), createdAt: item.created_at }))
  const remoteTransactionTypes = new Map(remoteTransactions.map((item) => [item.id, item.type]))
  return {
    categories: (categories.data ?? []).map((item) => ({ id: item.id, name: item.name, createdAt: item.created_at })),
    units: (units.data ?? []).map((item) => ({ id: item.id, name: item.name, abbreviation: item.abbreviation, createdAt: item.created_at })),
    suppliers: (suppliers.data ?? []).map((item) => ({ id: item.id, name: item.name, contact: item.contact ?? '', address: item.address ?? '', createdAt: item.created_at })),
    ingredients: (ingredients.data ?? []).map((item) => ({ id: item.id, code: item.code, name: item.name, categoryId: item.category_id, unitId: item.unit_id, type: item.type, minStock: Number(item.min_stock), currentStock: Number(item.current_stock), costPerUnit: Number(item.cost_per_unit), cogsPerUnit: Number(item.cogs_per_unit), isActive: item.is_active, createdAt: item.created_at })),
    menus: (menus.data ?? []).map((item) => ({ id: item.id, name: item.name, category: item.category ?? '', price: Number(item.price), isActive: item.is_active, activeRecipeVersion: item.active_recipe_version, createdAt: item.created_at })),
    recipes: recipesLocal,
    transactions: remoteTransactions,
    movements: (movements.data ?? []).filter((item) => !deletedIds.includes(item.transaction_id)).map((item) => ({ id: item.id, transactionId: item.transaction_id, ingredientId: item.ingredient_id, transactionType: remoteTransactionTypes.get(item.transaction_id) ?? 'ADJUSTMENT', direction: item.direction, quantity: Number(item.quantity), balanceAfter: Number(item.balance_after), description: item.description ?? '', createdAt: item.created_at })),
    deletedTransactionIds: deletedIds,
  }
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Konfigurasi Supabase belum tersedia.')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user.email ?? email
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Konfigurasi Supabase belum tersedia.')
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data.user?.email ?? email
}

export async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
