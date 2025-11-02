/*
 * Decompiled with CFR 0.152.
 */
package com.ctf.stockapp.common.model;

import java.io.Serializable;

public class Stock
implements Serializable {
    private static final long serialVersionUID = 1L;
    private String symbol;
    private String name;
    private double price;

    public Stock() {
    }

    public Stock(String symbol, String name, double price) {
        this.symbol = symbol;
        this.name = name;
        this.price = price;
    }

    public String getSymbol() {
        return this.symbol;
    }

    public void setSymbol(String symbol) {
        this.symbol = symbol;
    }

    public String getName() {
        return this.name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public double getPrice() {
        return this.price;
    }

    public void setPrice(double price) {
        this.price = price;
    }
}
