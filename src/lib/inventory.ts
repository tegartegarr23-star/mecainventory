import type { AppData, InventoryTransaction, MovementDraft, Recipe, StockMovement, TransactionType } from '../types'

export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
export const now = () => new Date().toISOString()
export const today = () => new Date().toISOString().slice(0, 10)
export const number = (value: unknown) => Math.round((Number(value) || 0) * 10000) / 10000
export const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0)
export const qty = (value: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value || 0)

export function activeRecipe(data: AppData, ownerType: Recipe['ownerType'], ownerId: string) {
  return data.recipes.find((recipe) => recipe.ownerType === ownerType && recipe.isActive && (ownerType === 'menu' ? recipe.menuId === ownerId : recipe.targetIngredientId === ownerId))
}

export function recipeCost(data: AppData, recipe?: Recipe) {
  if (!recipe) return 0
  return recipe.details.reduce((total, detail) => total + detail.quantity * (data.ingredients.find((item) => item.id === detail.ingredientId)?.cogsPerUnit ?? 0), 0)
}

export function recomputeStock(data: AppData): AppData {
  const balances = new Map(data.ingredients.map((ingredient) => [ingredient.id, 0]))
  const transactions = new Map(data.transactions.map((transaction) => [transaction.id, transaction]))
  const sorted = [...data.movements].sort((a, b) => {
    const ta = transactions.get(a.transactionId)?.transactionDate ?? a.createdAt
    const tb = transactions.get(b.transactionId)?.transactionDate ?? b.createdAt
    return `${ta}|${a.createdAt}|${a.id}`.localeCompare(`${tb}|${b.createdAt}|${b.id}`)
  })
  const movements = sorted.map((movement) => {
    const current = balances.get(movement.ingredientId) ?? 0
    const balanceAfter = number(current + (movement.direction === 'in' ? movement.quantity : -movement.quantity))
    balances.set(movement.ingredientId, balanceAfter)
    return { ...movement, balanceAfter }
  })
  return {
    ...data,
    movements,
    ingredients: data.ingredients.map((ingredient) => ({ ...ingredient, currentStock: number(balances.get(ingredient.id) ?? 0) })),
  }
}

export function addTransaction(data: AppData, transaction: Omit<InventoryTransaction, 'id' | 'createdAt'>, drafts: MovementDraft[]): AppData {
  const tx: InventoryTransaction = { ...transaction, id: uid(), createdAt: now() }
  const movements: StockMovement[] = drafts.filter((draft) => draft.ingredientId && draft.quantity > 0).map((draft) => ({
    id: uid(), transactionId: tx.id, ingredientId: draft.ingredientId, transactionType: tx.type,
    direction: draft.direction, quantity: number(draft.quantity), balanceAfter: 0, description: draft.description, createdAt: tx.createdAt,
  }))
  return recomputeStock({ ...data, transactions: [tx, ...data.transactions], movements: [...data.movements, ...movements] })
}

export function deleteTransaction(data: AppData, transactionId: string): AppData {
  return recomputeStock({
    ...data,
    transactions: data.transactions.filter((item) => item.id !== transactionId),
    movements: data.movements.filter((item) => item.transactionId !== transactionId),
    deletedTransactionIds: [...new Set([...data.deletedTransactionIds, transactionId])],
  })
}

export function reference(type: TransactionType) { return `${type}-${today().replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` }

export function outgoingSufficiency(data: AppData, drafts: MovementDraft[]) {
  const demand = new Map<string, number>()
  drafts.filter((item) => item.direction === 'out').forEach((item) => demand.set(item.ingredientId, number((demand.get(item.ingredientId) ?? 0) + item.quantity)))
  return [...demand].map(([ingredientId, required]) => {
    const ingredient = data.ingredients.find((item) => item.id === ingredientId)
    return { ingredientId, name: ingredient?.name ?? 'Bahan', required, available: ingredient?.currentStock ?? 0, short: Math.max(0, required - (ingredient?.currentStock ?? 0)) }
  })
}
