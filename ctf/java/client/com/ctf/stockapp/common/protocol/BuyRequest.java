/*
 * Decompiled with CFR 0.152.
 */
package com.ctf.stockapp.common.protocol;

import com.ctf.stockapp.common.protocol.Request;

public class BuyRequest
extends Request {
    private static final long serialVersionUID = 1L;
    private String stockSymbol;
    private int quantity;
    private Object data;

    public BuyRequest() {
    }

    public BuyRequest(String stockSymbol, int quantity) {
        this.stockSymbol = stockSymbol;
        this.quantity = quantity;
    }

    public String getStockSymbol() {
        return this.stockSymbol;
    }

    public void setStockSymbol(String stockSymbol) {
        this.stockSymbol = stockSymbol;
    }

    public int getQuantity() {
        return this.quantity;
    }

    public void setQuantity(int quantity) {
        this.quantity = quantity;
    }

    public Object getData() {
        return this.data;
    }

    public void setData(Object data) {
        this.data = data;
    }
}
