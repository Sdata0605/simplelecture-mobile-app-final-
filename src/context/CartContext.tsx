import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CART_STORAGE_KEY = 'cart_items';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  thumbnail_url?: string | null;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  isInCart: (itemId: string) => boolean;
  cartTotal: number;
  cartCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadCart();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      saveCart(cartItems);
    }
  }, [cartItems, isLoaded]);

  const loadCart = async () => {
    try {
      const stored = await AsyncStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        setCartItems(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const saveCart = async (items: CartItem[]) => {
    try {
      await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Error saving cart:', error);
    }
  };

  const addToCart = (item: CartItem) => {
    setCartItems(prev => {
      if (prev.some(i => i.id === item.id)) {
        return prev;
      }
      return [...prev, item];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCartItems(prev => prev.filter(item => item.id !== itemId));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const isInCart = (itemId: string): boolean => {
    return cartItems.some(item => item.id === itemId);
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + item.price, 0);
  const cartCount = cartItems.length;

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        clearCart,
        isInCart,
        cartTotal,
        cartCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
