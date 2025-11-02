/*
 * Decompiled with CFR 0.152.
 */
package com.ctf.stockapp.common.protocol;

import java.io.Serializable;

public abstract class Request
implements Serializable {
    private static final long serialVersionUID = 1L;
    private String sessionToken;

    public String getSessionToken() {
        return this.sessionToken;
    }

    public void setSessionToken(String sessionToken) {
        this.sessionToken = sessionToken;
    }
}
