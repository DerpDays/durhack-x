package com.ctf.stockapp.client.gui;

import com.ctf.stockapp.client.network.ServerConnection;
import com.ctf.stockapp.common.protocol.LoginRequest;
import com.ctf.stockapp.common.protocol.Response;

import javax.swing.*;
import java.awt.*;

public class LoginFrame extends JFrame {
    private JTextField usernameField;
    private JPasswordField passwordField;
    private JTextField serverField;
    private JTextField portField;
    private ServerConnection connection;
    
    // Test credentials for development
    private static final String TEST_USER = "trader";
    private static final String TEST_PASS = "trader123";

    public LoginFrame() {
        setTitle("Stock Trading App - Login");
        setSize(400, 300);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLocationRelativeTo(null);

        connection = new ServerConnection();

        initComponents();
    }

    private void initComponents() {
        JPanel mainPanel = new JPanel(new BorderLayout(10, 10));
        mainPanel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));

        // Title
        JLabel titleLabel = new JLabel("Stock Trading Platform", SwingConstants.CENTER);
        titleLabel.setFont(new Font("Arial", Font.BOLD, 24));
        mainPanel.add(titleLabel, BorderLayout.NORTH);

        // Form Panel
        JPanel formPanel = new JPanel(new GridBagLayout());
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.fill = GridBagConstraints.HORIZONTAL;

        // Server
        gbc.gridx = 0;
        gbc.gridy = 0;
        formPanel.add(new JLabel("Server:"), gbc);
        
        gbc.gridx = 1;
        serverField = new JTextField("localhost", 20);
        formPanel.add(serverField, gbc);

        // Port
        gbc.gridx = 0;
        gbc.gridy = 1;
        formPanel.add(new JLabel("Port:"), gbc);
        
        gbc.gridx = 1;
        portField = new JTextField("9999", 20);
        formPanel.add(portField, gbc);

        // Username
        gbc.gridx = 0;
        gbc.gridy = 2;
        formPanel.add(new JLabel("Username:"), gbc);
        
        gbc.gridx = 1;
        usernameField = new JTextField(20);
        formPanel.add(usernameField, gbc);

        // Password
        gbc.gridx = 0;
        gbc.gridy = 3;
        formPanel.add(new JLabel("Password:"), gbc);
        
        gbc.gridx = 1;
        passwordField = new JPasswordField(20);
        formPanel.add(passwordField, gbc);

        mainPanel.add(formPanel, BorderLayout.CENTER);

        // Button Panel
        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.CENTER));
        JButton loginButton = new JButton("Login");
        loginButton.setPreferredSize(new Dimension(100, 30));
        loginButton.addActionListener(e -> performLogin());
        buttonPanel.add(loginButton);

        mainPanel.add(buttonPanel, BorderLayout.SOUTH);

        //remove after development - commented out for CTF challenge
        // JLabel hintLabel = new JLabel("<html><center>Default users: admin/admin123, support/password, trader/trader123</center></html>", SwingConstants.CENTER);
        // hintLabel.setFont(new Font("Arial", Font.ITALIC, 10));
        // hintLabel.setForeground(Color.GRAY);
        // mainPanel.add(hintLabel, BorderLayout.PAGE_END);
        
        // Add empty space to maintain layout
        JPanel spacerPanel = new JPanel();
        spacerPanel.setPreferredSize(new Dimension(0, 20));
        mainPanel.add(spacerPanel, BorderLayout.PAGE_END);

        add(mainPanel);

        // Enter key listener
        passwordField.addActionListener(e -> performLogin());
    }

    private void performLogin() {
        String username = usernameField.getText().trim();
        String password = new String(passwordField.getPassword());
        String server = serverField.getText().trim();
        String portStr = portField.getText().trim();

        if (username.isEmpty() || password.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Please enter username and password", 
                "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        try {
            int port = Integer.parseInt(portStr);
            connection.setHost(server);
            connection.setPort(port);

            LoginRequest request = new LoginRequest(username, password);
            Response response = connection.sendRequest(request);

            if (response.isSuccess()) {
                String sessionToken = (String) response.getData();
                JOptionPane.showMessageDialog(this, "Login successful!", 
                    "Success", JOptionPane.INFORMATION_MESSAGE);
                
                // Open main trading frame
                TradingFrame tradingFrame = new TradingFrame(connection, sessionToken, username);
                tradingFrame.setVisible(true);
                
                // Close login frame
                dispose();
            } else {
                JOptionPane.showMessageDialog(this, "Login failed: " + response.getMessage(), 
                    "Error", JOptionPane.ERROR_MESSAGE);
            }

        } catch (NumberFormatException e) {
            JOptionPane.showMessageDialog(this, "Invalid port number", 
                "Error", JOptionPane.ERROR_MESSAGE);
        } catch (Exception e) {
            JOptionPane.showMessageDialog(this, "Connection error: " + e.getMessage(), 
                "Error", JOptionPane.ERROR_MESSAGE);
            e.printStackTrace();
        }
    }
}

