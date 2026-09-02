import React from 'react';
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function AdLanding() {
    const [location] = useLocation();
    const searchParams = new URLSearchParams(window.location.search);
    const brand = searchParams.get('brand') || 'generic';

    const brands: Record<string, any> = {
        binance: {
            name: "Binance",
            color: "#F3BA2F",
            textColor: "#141413",
            heroText: "Exchange the World",
            subText: "Trade crypto with confidence.",
            cta: "Join Now",
            image: "https://public.bnbstatic.com/image/cms/blog/20220215/79502758-1c4b-449e-b769-633b432130c2.png" // Placeholder or similar
        },
        daraz: {
            name: "Daraz",
            color: "#FF5900",
            textColor: "#FAF9F5",
            heroText: "Discover Endless Possibilities",
            subText: "Pakistan's biggest online marketplace.",
            cta: "Shop Now",
            image: "https://laz-img-cdn.alicdn.com/images/ims-web/TB1d.q.b.T1gK0jSZFrXXcNCXXa.jpg"
        },
        foodpanda: {
            name: "Foodpanda",
            color: "#D70F64",
            textColor: "#FAF9F5",
            heroText: "Food delivery usage is up 100%",
            subText: "Order now and get 50% off.",
            cta: "Order Food",
            image: "https://images.deliveryhero.io/image/foodpanda/home-vendor-pk.jpg"
        },
        amazon: {
            name: "Amazon",
            color: "#232F3E",
            textColor: "#FAF9F5",
            heroText: "Spend less. Smile more.",
            subText: "Free shipping on millions of items.",
            cta: "Browse Deals",
            image: "https://m.media-amazon.com/images/I/71qid7QFWJL._SX3000_.jpg"
        },
        generic: {
            name: "Premium Partner",
            color: "#333",
            textColor: "#FAF9F5",
            heroText: "Exclusive Offer",
            subText: "Limited time opportunity for THORX users.",
            cta: "Learn More",
            image: ""
        }
    };

    const activeBrand = brands[brand] || brands.generic;

    return (
        <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: activeBrand.color === '#232F3E' || activeBrand.color === '#333' ? '#f0f2f5' : 'white' }}>
            {/* Mock Header */}
            <header style={{ backgroundColor: activeBrand.color }} className="p-4 flex items-center justify-between text-white shadow-md">
                <h1 className="font-bold text-xl tracking-tight" style={{ color: activeBrand.textColor }}>{activeBrand.name}</h1>
                <div className="hidden md:flex gap-4 text-sm font-medium" style={{ color: activeBrand.textColor }}>
                    <span>Products</span>
                    <span>Solutions</span>
                    <span>Pricing</span>
                </div>
                <Button variant="outline" className="bg-white/10 hover:bg-white/20 border-white/20 text-current" style={{ color: activeBrand.textColor }}>
                    Sign In
                </Button>
            </header>

            {/* Mock Hero */}
            <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-8 md:p-16 gap-12 max-w-7xl mx-auto">
                <div className="flex-1 space-y-6 text-center md:text-left">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-gray-900 leading-[0.9] mb-4">
                            {activeBrand.heroText}
                        </h2>
                        <p className="text-xl md:text-2xl text-gray-600 font-medium mb-8">
                            {activeBrand.subText}
                        </p>
                        <Button size="lg" className="h-16 px-10 text-xl font-bold rounded-full shadow-xl hover:scale-105 transition-transform" style={{ backgroundColor: activeBrand.color, color: activeBrand.textColor }}>
                            {activeBrand.cta}
                        </Button>
                        <p className="mt-4 text-sm text-gray-500 max-w-md mx-auto md:mx-0">
                            *Terms and conditions apply. Offer valid for new customers only.
                        </p>
                    </motion.div>
                </div>

                {/* Mock Visual/Image Placeholder */}
                <div className="flex-1 w-full flex justify-center">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.8 }}
                        className="w-full aspect-square max-w-[500px] bg-gradient-to-br from-gray-200 to-gray-100 rounded-3xl shadow-2xl flex items-center justify-center overflow-hidden border-8 border-white"
                    >
                        {activeBrand.image ? (
                            // Simple image if available, otherwise stylish pattern
                            <img src={activeBrand.image} className="w-full h-full object-cover" alt="Product" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                            <span className="text-9xl font-black text-gray-300 opacity-50">{activeBrand.name[0]}</span>
                        )}
                    </motion.div>
                </div>
            </div>

            {/* Mock Features Grid */}
            <div className="bg-gray-50 py-16 px-4">
                <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                            <div className="w-12 h-12 rounded-full mb-4 flex items-center justify-center" style={{ backgroundColor: `${activeBrand.color}20` }}>
                                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: activeBrand.color }} />
                            </div>
                            <h3 className="font-bold text-lg mb-2">Feature {i}</h3>
                            <p className="text-gray-500">Experience the best in class service with our premium offering designed just for you.</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
