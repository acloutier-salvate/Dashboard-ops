import { round, uid } from "./inventory-utils.js?v=98";
import { calculateOrder, orderTotals, stockGap } from "./inventory-calculations.js?v=511";

export const ORDER_STORAGE_KEY = "dashboard_ops_inventory_orders_v1";

export function buildPurchaseOrder(state){
  const order = calculateOrder(state);
  const items = order.lowItems.map((product) => {
    const gap = stockGap(product);
    const cost = Number(product.case_cost ?? product.unit_cost ?? 0);
    return {
      product_id:product.id,
      product_name:product.product_name,
      recommended_quantity:gap,
      adjusted_quantity:gap,
      estimated_cost:round(gap * cost)
    };
  });

  return {
    id:uid("po"),
    restaurant:state.restaurant,
    order_date:new Date().toISOString(),
    projected_sales:Number(state.order.sales || 0),
    target_foodcost:Number(state.order.foodCost || 0),
    projected_food_budget:round(order.budget),
    current_inventory_value:round(order.inventoryValue),
    recommended_order_value:round(order.recommended),
    status:"draft",
    items
  };
}

export function buildPurchaseOrderFromItems(state, items=[]){
  const totals = orderTotals(state, items);
  return {
    id:uid("po"),
    restaurant:state.restaurant,
    order_date:new Date().toISOString(),
    projected_sales:Number(state.order.sales || 0),
    target_foodcost:Number(state.order.foodCost || 0),
    projected_food_budget:round(totals.budget),
    current_inventory_value:round(totals.inventoryValue),
    recommended_order_value:round(totals.orderTotal),
    status:"draft",
    items:items.map((item) => ({
      product_id:item.product_id,
      product_name:item.product_name,
      recommended_quantity:Number(item.recommended_quantity || 0),
      adjusted_quantity:Number(item.adjusted_quantity || 0),
      estimated_cost:round(Number(item.estimated_cost || 0))
    }))
  };
}

export function readLocalPurchaseOrders(){
  try{
    return JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) || "[]");
  }catch{
    return [];
  }
}

export function saveLocalPurchaseOrder(purchaseOrder){
  const list = readLocalPurchaseOrders();
  list.unshift(purchaseOrder);
  localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(list.slice(0, 50)));
  return purchaseOrder;
}

export function createLocalPurchaseOrder(state){
  return saveLocalPurchaseOrder(buildPurchaseOrder(state));
}

export function saveAssistedPurchaseOrder(state, items){
  return saveLocalPurchaseOrder(buildPurchaseOrderFromItems(state, items));
}

export function latestLocalPurchaseOrderForRestaurant(restaurant){
  return readLocalPurchaseOrders().find((order) => order.restaurant === restaurant) || null;
}
