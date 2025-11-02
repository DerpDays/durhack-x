/*
 * Decompiled with CFR 0.152.
 */
package com.ctf.stockapp.common.model;

import java.io.Serializable;
import java.util.HashMap;
import java.util.Map;

public class User
implements Serializable {
    private static final long serialVersionUID = 1L;
    private String username;
    private String password;
    private double balance;
    private Map<String, Integer> portfolio;

    public User() {
        this.portfolio = new HashMap<String, Integer>();
    }

    public User(String username, String password, double balance) {
        this.username = username;
        this.password = password;
        this.balance = balance;
        this.portfolio = new HashMap<String, Integer>();
    }

    public String getUsername() {
        return this.username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return this.password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public double getBalance() {
        return this.balance;
    }

    public void setBalance(double balance) {
        this.balance = balance;
    }

    public Map<String, Integer> getPortfolio() {
        return this.portfolio;
    }

    public void setPortfolio(Map<String, Integer> portfolio) {
        this.portfolio = portfolio;
    }

    public void addStock(String symbol, int quantity) {
        this.portfolio.put(symbol, this.portfolio.getOrDefault(symbol, 0) + quantity);
    }

    public boolean removeStock(String symbol, int quantity) {
        int current = this.portfolio.getOrDefault(symbol, 0);
        if (current >= quantity) {
            if (current == quantity) {
                this.portfolio.remove(symbol);
            } else {
                this.portfolio.put(symbol, current - quantity);
            }
            return true;
        }
        return false;
    }
}
