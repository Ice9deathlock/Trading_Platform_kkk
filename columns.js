/**
 * This file defines the structure of the Account Manager pages: "Orders", "Positions", and "Account Summary".
 * Each Account Manager page is a table, where each column is an `AccountManagerColumnBase` object.
 * These objects are used in the `accountManagerInfo` method which builds the Account Manager.
 */
import { OrderStatusFilter, CommonAccountManagerColumnId, } from '../../charting_library/broker-api';
/**
 * Column structure for the "Orders" page
 */
export const ordersPageColumns = [
    {
        label: 'Symbol',
        formatter: "symbol" /* StandardFormatterName.Symbol */,
        id: CommonAccountManagerColumnId.Symbol,
        dataFields: ['symbol', 'symbol', 'message'],
    },
    {
        label: 'Side',
        id: 'side',
        dataFields: ['side'],
        formatter: "side" /* StandardFormatterName.Side */,
    },
    {
        label: 'Type',
        id: 'type',
        dataFields: ['type', 'parentId', 'stopType'],
        formatter: "type" /* StandardFormatterName.Type */,
    },
    {
        label: 'Qty',
        alignment: 'right',
        id: 'qty',
        dataFields: ['qty'],
        help: 'Size in lots',
        formatter: "formatQuantity" /* StandardFormatterName.FormatQuantity */,
    },
    {
        label: 'Limit Price',
        alignment: 'right',
        id: 'limitPrice',
        dataFields: ['limitPrice'],
        formatter: "formatPrice" /* StandardFormatterName.FormatPrice */,
    },
    {
        label: 'Stop Price',
        alignment: 'right',
        id: 'stopPrice',
        dataFields: ['stopPrice'],
        formatter: "formatPrice" /* StandardFormatterName.FormatPrice */,
    },
    {
        label: 'Last',
        alignment: 'right',
        id: 'last',
        dataFields: ['last'],
        formatter: "formatPriceForexSup" /* StandardFormatterName.FormatPriceForexSup */,
        highlightDiff: true,
    },
    {
        label: 'Execution',
        id: 'execution',
        dataFields: ['execution'],
    },
    {
        label: 'Status',
        id: 'status',
        dataFields: ['status'],
        formatter: "status" /* StandardFormatterName.Status */,
        supportedStatusFilters: [OrderStatusFilter.All],
    },
    {
        label: 'Order ID',
        id: 'id',
        dataFields: ['id'],
    },
];
/**
 * Column structure for the "Positions" page
 */
export const positionsPageColumns = [
    {
        label: 'Symbol',
        formatter: "symbol" /* StandardFormatterName.Symbol */,
        id: CommonAccountManagerColumnId.Symbol,
        dataFields: ['symbol', 'symbol', 'message'],
    },
    {
        label: 'Side',
        id: 'side',
        dataFields: ['side'],
        formatter: "side" /* StandardFormatterName.Side */,
    },
    {
        label: 'Qty',
        alignment: 'right',
        id: 'qty',
        dataFields: ['qty'],
        help: 'Size in lots',
        formatter: "formatQuantity" /* StandardFormatterName.FormatQuantity */,
    },
    {
        label: 'Avg Fill Price',
        alignment: 'right',
        id: 'avgPrice',
        dataFields: ['avgPrice'],
        formatter: "formatPrice" /* StandardFormatterName.FormatPrice */,
    },
    {
        label: 'Last',
        alignment: 'right',
        id: 'last',
        dataFields: ['last'],
        formatter: "formatPriceForexSup" /* StandardFormatterName.FormatPriceForexSup */,
        highlightDiff: true,
    },
    {
        label: 'Profit',
        alignment: 'right',
        id: 'pl',
        dataFields: ['pl'],
        formatter: "profit" /* StandardFormatterName.Profit */,
    },
    {
        label: 'Stop Loss',
        alignment: 'right',
        id: 'stopLoss',
        dataFields: ['stopLoss'],
        formatter: "formatPrice" /* StandardFormatterName.FormatPrice */,
    },
    {
        label: 'Take Profit',
        alignment: 'right',
        id: 'takeProfit',
        dataFields: ['takeProfit'],
        formatter: "formatPrice" /* StandardFormatterName.FormatPrice */,
    },
];
/**
 * Column structure for the custom "Account Summary" page
 */
export const accountSummaryColumns = [
    {
        label: 'Title',
        notSortable: true,
        id: 'title',
        dataFields: ['title'],
        formatter: 'custom_uppercase',
    },
    {
        label: 'Balance',
        alignment: 'right',
        id: 'balance',
        dataFields: ['balance'],
        formatter: "fixed" /* StandardFormatterName.Fixed */,
    },
    {
        label: 'Open PL',
        alignment: 'right',
        id: 'pl',
        dataFields: ['pl'],
        formatter: "profit" /* StandardFormatterName.Profit */,
        notSortable: true,
    },
    {
        label: 'Equity',
        alignment: 'right',
        id: 'equity',
        dataFields: ['equity'],
        formatter: "fixed" /* StandardFormatterName.Fixed */,
        notSortable: true,
    },
];
