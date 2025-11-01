package com.ctf.stockapp.client.gui;

import com.ctf.stockapp.client.network.ServerConnection;
import com.ctf.stockapp.common.model.Stock;
import com.ctf.stockapp.common.protocol.*;

import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.util.ArrayList;
import java.util.Map;

public class TradingFrame extends JFrame {
    private ServerConnection connection;
    private String sessionToken;
    private String username;

    private JLabel balanceLabel;
    private JTable stocksTable;
    private JTable portfolioTable;
    private DefaultTableModel stocksTableModel;
    private DefaultTableModel portfolioTableModel;

    public TradingFrame(ServerConnection connection, String sessionToken, String username) {
        this.connection = connection;
        this.sessionToken = sessionToken;
        this.username = username;

        setTitle("Stock Trading Platform - " + username);
        setSize(900, 600);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLocationRelativeTo(null);

        initComponents();
        refreshData();
    }

    private void initComponents() {
        JPanel mainPanel = new JPanel(new BorderLayout(10, 10));
        mainPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

        // Top Panel - Balance
        JPanel topPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        topPanel.add(new JLabel("Current Balance:"));
        balanceLabel = new JLabel("$0.00");
        balanceLabel.setFont(new Font("Arial", Font.BOLD, 16));
        balanceLabel.setForeground(new Color(0, 128, 0));
        topPanel.add(balanceLabel);
        
        JButton refreshButton = new JButton("Refresh");
        refreshButton.addActionListener(e -> refreshData());
        topPanel.add(refreshButton);

        mainPanel.add(topPanel, BorderLayout.NORTH);

        // Center Panel - Split between stocks and portfolio
        JSplitPane splitPane = new JSplitPane(JSplitPane.VERTICAL_SPLIT);
        splitPane.setResizeWeight(0.5);

        // Stocks Panel
        JPanel stocksPanel = new JPanel(new BorderLayout());
        stocksPanel.setBorder(BorderFactory.createTitledBorder("Available Stocks"));

        String[] stocksColumns = {"Symbol", "Name", "Price"};
        stocksTableModel = new DefaultTableModel(stocksColumns, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false;
            }
        };
        stocksTable = new JTable(stocksTableModel);
        stocksTable.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        JScrollPane stocksScrollPane = new JScrollPane(stocksTable);

        JPanel stocksButtonPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        JButton buyButton = new JButton("Buy");
        buyButton.addActionListener(e -> performBuy());
        stocksButtonPanel.add(buyButton);

        stocksPanel.add(stocksScrollPane, BorderLayout.CENTER);
        stocksPanel.add(stocksButtonPanel, BorderLayout.SOUTH);

        // Portfolio Panel
        JPanel portfolioPanel = new JPanel(new BorderLayout());
        portfolioPanel.setBorder(BorderFactory.createTitledBorder("My Portfolio"));

        String[] portfolioColumns = {"Symbol", "Quantity", "Current Price", "Total Value"};
        portfolioTableModel = new DefaultTableModel(portfolioColumns, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false;
            }
        };
        portfolioTable = new JTable(portfolioTableModel);
        portfolioTable.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        JScrollPane portfolioScrollPane = new JScrollPane(portfolioTable);

        JPanel portfolioButtonPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        JButton sellButton = new JButton("Sell");
        sellButton.addActionListener(e -> performSell());
        portfolioButtonPanel.add(sellButton);

        portfolioPanel.add(portfolioScrollPane, BorderLayout.CENTER);
        portfolioPanel.add(portfolioButtonPanel, BorderLayout.SOUTH);

        splitPane.setTopComponent(stocksPanel);
        splitPane.setBottomComponent(portfolioPanel);

        mainPanel.add(splitPane, BorderLayout.CENTER);

        add(mainPanel);
    }

    private void refreshData() {
        refreshBalance();
        refreshStocks();
        refreshPortfolio();
    }

    private void refreshBalance() {
        try {
            GetBalanceRequest request = new GetBalanceRequest();
            request.setSessionToken(sessionToken);
            Response response = connection.sendRequest(request);

            if (response.isSuccess()) {
                Double balance = (Double) response.getData();
                balanceLabel.setText(String.format("$%.2f", balance));
            } else {
                JOptionPane.showMessageDialog(this, "Failed to get balance: " + response.getMessage(),
                    "Error", JOptionPane.ERROR_MESSAGE);
            }
        } catch (Exception e) {
            JOptionPane.showMessageDialog(this, "Error: " + e.getMessage(),
                "Error", JOptionPane.ERROR_MESSAGE);
            e.printStackTrace();
        }
    }

    private void refreshStocks() {
        try {
            GetStocksRequest request = new GetStocksRequest();
            request.setSessionToken(sessionToken);
            Response response = connection.sendRequest(request);

            if (response.isSuccess()) {
                stocksTableModel.setRowCount(0);
                @SuppressWarnings("unchecked")
                ArrayList<Stock> stocks = (ArrayList<Stock>) response.getData();
                
                for (Stock stock : stocks) {
                    stocksTableModel.addRow(new Object[]{
                        stock.getSymbol(),
                        stock.getName(),
                        String.format("$%.2f", stock.getPrice())
                    });
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void refreshPortfolio() {
        try {
            GetPortfolioRequest portfolioRequest = new GetPortfolioRequest();
            portfolioRequest.setSessionToken(sessionToken);
            Response portfolioResponse = connection.sendRequest(portfolioRequest);

            GetStocksRequest stocksRequest = new GetStocksRequest();
            stocksRequest.setSessionToken(sessionToken);
            Response stocksResponse = connection.sendRequest(stocksRequest);

            if (portfolioResponse.isSuccess() && stocksResponse.isSuccess()) {
                portfolioTableModel.setRowCount(0);
                
                @SuppressWarnings("unchecked")
                Map<String, Integer> portfolio = (Map<String, Integer>) portfolioResponse.getData();
                
                @SuppressWarnings("unchecked")
                ArrayList<Stock> stocks = (ArrayList<Stock>) stocksResponse.getData();
                
                Map<String, Stock> stockMap = new java.util.HashMap<>();
                for (Stock stock : stocks) {
                    stockMap.put(stock.getSymbol(), stock);
                }

                for (Map.Entry<String, Integer> entry : portfolio.entrySet()) {
                    Stock stock = stockMap.get(entry.getKey());
                    if (stock != null) {
                        double totalValue = stock.getPrice() * entry.getValue();
                        portfolioTableModel.addRow(new Object[]{
                            entry.getKey(),
                            entry.getValue(),
                            String.format("$%.2f", stock.getPrice()),
                            String.format("$%.2f", totalValue)
                        });
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void performBuy() {
        int selectedRow = stocksTable.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Please select a stock to buy",
                "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        String symbol = (String) stocksTableModel.getValueAt(selectedRow, 0);
        String priceStr = (String) stocksTableModel.getValueAt(selectedRow, 2);
        
        String quantityStr = JOptionPane.showInputDialog(this, 
            "Enter quantity to buy:", "Buy Stock", JOptionPane.QUESTION_MESSAGE);
        
        if (quantityStr == null || quantityStr.trim().isEmpty()) {
            return;
        }

        try {
            int quantity = Integer.parseInt(quantityStr.trim());
            if (quantity <= 0) {
                JOptionPane.showMessageDialog(this, "Quantity must be positive",
                    "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            BuyRequest request = new BuyRequest(symbol, quantity);
            request.setSessionToken(sessionToken);
            Response response = connection.sendRequest(request);

            if (response.isSuccess()) {
                JOptionPane.showMessageDialog(this, "Purchase successful!",
                    "Success", JOptionPane.INFORMATION_MESSAGE);
                refreshData();
            } else {
                JOptionPane.showMessageDialog(this, "Purchase failed: " + response.getMessage(),
                    "Error", JOptionPane.ERROR_MESSAGE);
            }

        } catch (NumberFormatException e) {
            JOptionPane.showMessageDialog(this, "Invalid quantity",
                "Error", JOptionPane.ERROR_MESSAGE);
        } catch (Exception e) {
            JOptionPane.showMessageDialog(this, "Error: " + e.getMessage(),
                "Error", JOptionPane.ERROR_MESSAGE);
            e.printStackTrace();
        }
    }

    private void performSell() {
        int selectedRow = portfolioTable.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Please select a stock to sell",
                "Error", JOptionPane.ERROR_MESSAGE);
            return;
        }

        String symbol = (String) portfolioTableModel.getValueAt(selectedRow, 0);
        int currentQuantity = (Integer) portfolioTableModel.getValueAt(selectedRow, 1);
        
        String quantityStr = JOptionPane.showInputDialog(this, 
            "Enter quantity to sell (max: " + currentQuantity + "):", 
            "Sell Stock", JOptionPane.QUESTION_MESSAGE);
        
        if (quantityStr == null || quantityStr.trim().isEmpty()) {
            return;
        }

        try {
            int quantity = Integer.parseInt(quantityStr.trim());
            if (quantity <= 0 || quantity > currentQuantity) {
                JOptionPane.showMessageDialog(this, "Invalid quantity",
                    "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            SellRequest request = new SellRequest(symbol, quantity);
            request.setSessionToken(sessionToken);
            Response response = connection.sendRequest(request);

            if (response.isSuccess()) {
                JOptionPane.showMessageDialog(this, "Sale successful!",
                    "Success", JOptionPane.INFORMATION_MESSAGE);
                refreshData();
            } else {
                JOptionPane.showMessageDialog(this, "Sale failed: " + response.getMessage(),
                    "Error", JOptionPane.ERROR_MESSAGE);
            }

        } catch (NumberFormatException e) {
            JOptionPane.showMessageDialog(this, "Invalid quantity",
                "Error", JOptionPane.ERROR_MESSAGE);
        } catch (Exception e) {
            JOptionPane.showMessageDialog(this, "Error: " + e.getMessage(),
                "Error", JOptionPane.ERROR_MESSAGE);
            e.printStackTrace();
        }
    }
}

