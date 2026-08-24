export type IngredientType = 'raw' | 'prepared'
export type TransactionType = 'INIT' | 'PURCHASE' | 'PREPARE' | 'PRODUCTION' | 'ADJUSTMENT'
export type MovementDirection = 'in' | 'out'
export type AdjustmentMode = 'set' | 'plus' | 'minus'

export interface Category { id: string; name: string; createdAt: string }
export interface Unit { id: string; name: string; abbreviation: string; createdAt: string }
export interface Supplier { id: string; name: string; contact: string; address: string; createdAt: string }
export interface Ingredient {
  id: string; code: string; name: string; categoryId: string; unitId: string; type: IngredientType
  minStock: number; currentStock: number; costPerUnit: number; cogsPerUnit: number; isActive: boolean; createdAt: string
}
export interface Menu { id: string; name: string; category: string; price: number; isActive: boolean; activeRecipeVersion: number; createdAt: string }
export interface RecipeDetail { id: string; ingredientId: string; quantity: number }
export interface Recipe {
  id: string; ownerType: 'menu' | 'prepared'; menuId?: string; targetIngredientId?: string; version: number
  isActive: boolean; yieldQuantity: number; notes: string; details: RecipeDetail[]; createdAt: string
}
export interface MenuSale { menuId: string; portions: number }
export interface InventoryTransaction {
  id: string; type: TransactionType; transactionDate: string; referenceNo: string; notes: string; supplierId?: string
  menuSales?: MenuSale[]; adjustmentReason?: string; createdAt: string
}
export interface StockMovement {
  id: string; transactionId: string; ingredientId: string; transactionType: TransactionType; direction: MovementDirection
  quantity: number; balanceAfter: number; description: string; createdAt: string
}
export interface AppData {
  categories: Category[]; units: Unit[]; suppliers: Supplier[]; ingredients: Ingredient[]; menus: Menu[]
  recipes: Recipe[]; transactions: InventoryTransaction[]; movements: StockMovement[]; deletedTransactionIds: string[]
}

export interface MovementDraft { ingredientId: string; direction: MovementDirection; quantity: number; description: string }
