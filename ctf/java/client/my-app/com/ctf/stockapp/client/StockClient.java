package com.ctf.stockapp.client;

import com.ctf.stockapp.client.network.ServerConnection;
import com.ctf.stockapp.common.protocol.LoginRequest;
import com.ctf.stockapp.common.protocol.GetBalanceRequest;
import com.ctf.stockapp.common.protocol.Response;
import com.ctf.stockapp.common.protocol.Request;

import javax.swing.*;

public class StockClient {

    public static String username = "admin";
    public static String password = "admin123";
    public static String server = "team54-thickapp.durhack.qwerty.technology";
    public static String portStr = "9999";


    private static ServerConnection connection;
    private static String sessionToken;

    public static Response mySendRequest(Request request) {
        try {
            return connection.sendRequest(request);
        } catch (Exception e) {
            System.out.println("Error: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
            return null;
        }
    }

    public static void actions() {
        GetBalanceRequest myRequest = new GetBalanceRequest();
        myRequest.setSessionToken(sessionToken);
        Response balance = mySendRequest(myRequest);
        System.out.println("Balance: success: " + balance.isSuccess() + " message: " + balance.getMessage() + " data: " + (double) balance.getData());
    }

    public static void main(String[] args) {

        connection = new ServerConnection();
        System.out.println("Trying to connect!");

        if (username.isEmpty() || password.isEmpty()) {
            System.out.println("Please enter username and password"); 
            return;
        }

        int port = 0;
        try {
            port = Integer.parseInt(portStr);
        } catch (NumberFormatException e) {
            System.out.println("Invalid port number");
        }
        try{
            connection.setHost(server);
            connection.setPort(port);

            LoginRequest request = new LoginRequest(username, password);
            Response response = connection.sendRequest(request);

            if (response.isSuccess()) {
                System.out.println("Login successful -> sessionToken: " + (String) response.getData());
                sessionToken = (String) response.getData();
                actions();
                return;
            } else {
                System.out.println("Login failed:\nMessage: " + response.getMessage() + "\nData: " + response.getData());
                return;
            }

        } catch (Exception e) {
            System.out.println("Connection error:\nMessage: " + e.getMessage() + "\nCause: " + e.getCause());
            e.printStackTrace();
        }

    }
}

