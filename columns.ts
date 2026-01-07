/**
 * This file defines the structure of the Account Manager pages: "Orders", "Positions", and "Account Summary".
 * Each Account Manager page is a table, where each column is an `AccountManagerColumnBase` object.
 * These objects are used in the `accountManagerInfo` method which builds the Account Manager.
 */
import {
	AccountManagerColumn,
	OrderTableColumn,
	OrderStatusFilter,
	StandardFormatterName,
	FormatterName,
	CommonAccountManagerColumnId,
} from '../../charting_library/broker-api';

/**
 * Column structure for the "Orders" page
 */
export const ordersPageColumns: OrderTableColumn[] = [
	{
		label: 'Symbol',
		formatter: StandardFormatterName.Symbol,
		id: CommonAccountManagerColumnId.Symbol,
		dataFields: ['symbol', 'symbol', 'message'],
	},
	{
		label: 'Side',
		id: 'side',
		dataFields: ['side'],
		formatter: StandardFormatterName.Side,
	},
	{
		label: 'Type',
		id: 'type',
		dataFields: ['type', 'parentId', 'stopType'],
		formatter: StandardFormatterName.Type,
	},
	{
		label: 'Qty',
		alignment: 'right',
		id: 'qty',
		dataFields: ['qty'],
		help: 'Size in lots',
		formatter: StandardFormatterName.FormatQuantity,
	},
	{
		label: 'Limit Price',
		alignment: 'right',
		id: 'limitPrice',
		dataFields: ['limitPrice'],
		formatter: StandardFormatterName.FormatPrice,
	},
	{
		label: 'Stop Price',
		alignment: 'right',
		id: 'stopPrice',
		dataFields: ['stopPrice'],
		formatter: StandardFormatterName.FormatPrice,
	},
	{
		label: 'Last',
		alignment: 'right',
		id: 'last',
		dataFields: ['last'],
		formatter: StandardFormatterName.FormatPriceForexSup,
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
		formatter: StandardFormatterName.Status,
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
export const positionsPageColumns: AccountManagerColumn[] = [
	{
		label: 'Symbol',
		formatter: StandardFormatterName.Symbol,
		id: CommonAccountManagerColumnId.Symbol,
		dataFields: ['symbol', 'symbol', 'message'],
	},
	{
		label: 'Side',
		id: 'side',
		dataFields: ['side'],
		formatter: StandardFormatterName.Side,
	},
	{
		label: 'Qty',
		alignment: 'right',
		id: 'qty',
		dataFields: ['qty'],
		help: 'Size in lots',
		formatter: StandardFormatterName.FormatQuantity,
	},
	{
		label: 'Avg Fill Price',
		alignment: 'right',
		id: 'avgPrice',
		dataFields: ['avgPrice'],
		formatter: StandardFormatterName.FormatPrice,
	},
	{
		label: 'Last',
		alignment: 'right',
		id: 'last',
		dataFields: ['last'],
		formatter: StandardFormatterName.FormatPriceForexSup,
		highlightDiff: true,
	},
	{
		label: 'Profit',
		alignment: 'right',
		id: 'pl',
		dataFields: ['pl'],
		formatter: StandardFormatterName.Profit,
	},
	{
		label: 'Stop Loss',
		alignment: 'right',
		id: 'stopLoss',
		dataFields: ['stopLoss'],
		formatter: StandardFormatterName.FormatPrice,
	},
	{
		label: 'Take Profit',
		alignment: 'right',
		id: 'takeProfit',
		dataFields: ['takeProfit'],
		formatter: StandardFormatterName.FormatPrice,
	},
];

/**
 * Column structure for the custom "Account Summary" page
 */
export const accountSummaryColumns: AccountManagerColumn[] = [
	{
		label: 'Title',
		notSortable: true,
		id: 'title',
		dataFields: ['title'],
		formatter: 'custom_uppercase' as FormatterName,
	},
	{
		label: 'Balance',
		alignment: 'right',
		id: 'balance',
		dataFields: ['balance'],
		formatter: StandardFormatterName.Fixed,
	},
	{
		label: 'Open PL',
		alignment: 'right',
		id: 'pl',
		dataFields: ['pl'],
		formatter: StandardFormatterName.Profit,
		notSortable: true,
	},
	{
		label: 'Equity',
		alignment: 'right',
		id: 'equity',
		dataFields: ['equity'],
		formatter: StandardFormatterName.Fixed,
		notSortable: true,
	},
];
