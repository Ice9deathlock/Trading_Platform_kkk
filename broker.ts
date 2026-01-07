import {
	AccountId,
	AccountManagerInfo,
	AccountManagerSummaryField,
	AccountMetainfo,
	ActionMetaInfo,
	Brackets,
	ConnectionStatus,
	DefaultContextMenuActionsParams,
	Execution,
	IBrokerConnectionAdapterHost,
	IDelegate,
	InstrumentInfo,
	IsTradableResult,
	IWatchedValue,
	MenuSeparator,
	Order,
	OrderStatus,
	OrderType,
	ParentType,
	PlaceOrderResult,
	Position,
	PreOrder,
	Side,
	StandardFormatterName,
	TradeContext,
} from '../../charting_library/broker-api';

import { BottomWidgetBarMode } from '../../charting_library/broker-api';

import { IDatafeedQuotesApi, QuoteData } from '../../charting_library/datafeed-api';

/**
 * Imports the objects for columns on the "Account Summary", "Orders", and "Positions" pages
 */
import {
	accountSummaryColumns,
	ordersPageColumns,
	positionsPageColumns,
} from './columns';

import { AbstractBrokerMinimal } from './abstract-broker-minimal';

interface SimpleMap<TValue> {
	[key: string]: TValue;
}

/** Defines a structure of the data object related to the custom "Account Summary" page in the Account Manager */
interface AccountManagerData {
	title: string;
	balance: number;
	equity: number;
	pl: number;
}

/** Defines an enumerated type which represents different types of bracket orders */
const enum BracketType {
	StopLoss,
	TakeProfit,
	TrailingStop,
}

/** Defines parameters for updating parent orders */
interface UpdateParentBracketParams {
	parent: Position | Order;
	bracket: Order | undefined;
	bracketType: BracketType;
	newPrice: number | undefined;
}

/**
 * Defines an array of order statuses, including only "Inactive" and "Working" statuses.
 * This variable is used to retrieve bracket orders associated with a parent ID in `_getBrackets` function.
 */
const activeOrderStatuses = [OrderStatus.Inactive, OrderStatus.Working];

export class BrokerDemo extends AbstractBrokerMinimal {
	/** Initializes the counter to 1, used to assign unique IDs to orders and positions */
	private _idsCounter: number = 1;

	/** Initializes an array to store position data */
	private readonly _positions: Position[] = [];

	/** Initializes an empty map to store positions indexed by their IDs */
	private readonly _positionById: SimpleMap<Position> = {};

	/** Initializes an empty map to store orders indexed by their IDs */
	private readonly _orderById: SimpleMap<Order> = {};

	/**
	 * Initializes variables of the "IWatchedValue" type.
	 * Watched values are values that should be constantly updated.
	 * In this example, balance and equity are watched values, so users have up-to-date data about their account's state.
	 */
	private readonly _balanceValue: IWatchedValue<number>;
	private readonly _equityValue: IWatchedValue<number>;

	/** Defines the initial values for the custom "Account Summary" page in the Account Manager */
	private readonly _accountManagerData: AccountManagerData = { title: 'Demo account', balance: 10000000, equity: 10000000, pl: 0 };

	/**
	 * Initializes a variable of the "IDelegate" type.
	 * Delegates are functions that are used to subscribe to specific events and get triggered when these events occur.
	 * In this example, delegates notify some places in the code about changes in the user's equity and balance values.
	 */
	private readonly _amChangeDelegate: IDelegate<(values: AccountManagerData) => void>;

	public constructor(host: IBrokerConnectionAdapterHost, quotesProvider: IDatafeedQuotesApi) {
		super(host, quotesProvider);

		// Create watched values for user's balance and equity
		this._balanceValue = this._host.factory.createWatchedValue(this._accountManagerData.balance);
		this._equityValue = this._host.factory.createWatchedValue(this._accountManagerData.equity);

		// Create a delegate object
		this._amChangeDelegate = this._host.factory.createDelegate();

		// Subscribe to updates on the user's balance and equity values in the Account Manager
		this._amChangeDelegate.subscribe(null, (values: AccountManagerData) => {
			this._balanceValue.setValue(values.balance);
			this._equityValue.setValue(values.equity);
		});
	}

	/**
	 * Defines the connection status for the Broker API.
	 * If any other value than `1` ("Connected") is returned, the Account Manager will display an endless spinner.
	 */
	public connectionStatus(): ConnectionStatus {
		return ConnectionStatus.Connected; // raises the "Trading.Core:Broker broker creation error: {}" error
	}

	/** Represents a mock function for a current account by returning an account ID '1' */
	public currentAccount(): AccountId {
		return '1' as AccountId;
	}

	/**
	 * Checks if a symbol can be traded.
	 * In this demo implementation, `isTradable` is a mock function that always returns `true`, meaning that all symbols can be traded.
	 * If not implemented this method will render the buy & sell buttons with a white background + tooltip indicating that the symbol cannot be traded.
	 */
	public async isTradable(_symbol: string): Promise<boolean | IsTradableResult> {
		return Promise.resolve(true);
	}

	/**
	 * Returns symbol information.
	 * The library calls this method when users open the Order Ticket or DOM panel.
	 * If this method is not implemented the buy & sell buttons in the Legend will display "..." (3 dots) instead of values returned by quotes.
	 */
	public async symbolInfo(symbol: string): Promise<InstrumentInfo> {
		const mintick = await this._host.getSymbolMinTick(symbol);
		const pipSize = mintick; // Pip size can differ from minTick
		const accountCurrencyRate = 1; // Account currency rate
		const pointValue = 1; // USD value of 1 point of price

		return {
			qty: {
				min: 1,
				max: 1e12,
				step: 1,
			},
			pipValue: pipSize * pointValue * accountCurrencyRate || 1,
			pipSize: pipSize,
			minTick: mintick,
			description: '',
		};
	}

	/** Returns users's orders */
	public async orders(): Promise<Order[]> {
		return this._orders();
	}

	/**
	 * Returns user's positions
	 * BrokerConfigFlags.supportPositions => default true
	 */
	public positions(): Promise<Position[]> {
		return Promise.resolve(this._positions.slice());
	}

	/**
	 * In the context of this demo we are not implementing the executions feature.
	 * Returns user's executions.
	 * BrokerConfigFlags.supportExecutions => default true
	 */
	public executions(_symbol: string): Promise<Execution[]> {
		return Promise.resolve([] as Execution[]);
	}

	/**
	 * Places an order and returns an object with the order ID.
	 * The library calls this method when users place orders in the UI.
	 */
	public async placeOrder(preOrder: PreOrder): Promise<PlaceOrderResult> {
		if (preOrder.duration) {
			// eslint-disable-next-line no-console
			console.log('Durations are not implemented in this sample.');
		}

		// Open the Account Manager
		this._host.setAccountManagerVisibilityMode(BottomWidgetBarMode.Normal);

		if (
			(preOrder.type === OrderType.Market || preOrder.type === undefined)
			&& this._getBrackets(preOrder.symbol).length > 0
		) {
			this._updateOrder(this._createOrder(preOrder));

			return {};
		}

		// Create orders with brackets
		const orderWithBrackets = this._createOrderWithBrackets(preOrder);
		orderWithBrackets.forEach((orderWithBracket: Order) => {
			this._updateOrder(orderWithBracket);
		});

		return {};
	}

	/**
	 * Modifies an existing order.
	 * The library calls this method when a user wants to modify an existing order.
	 */
	public async modifyOrder(order: Order, _confirmId?: string | undefined): Promise<void> {
		// Retrieve the order from `_orderById` map
		const originalOrder = this._orderById[order.id];

		if (originalOrder === undefined) {
			return;
		}

		this._updateOrder(order);

		if (order.parentId !== undefined) {
			return;
		}

		// Get the take-profit and stop-loss brackets associated with this order
		const takeProfitBracket = this._getTakeProfitBracket(order);
		const stopLossBracket = this._getStopLossBracket(order);

		// Update the object of the take-profit bracket order
		this._updateOrdersBracket({
			parent: order,
			bracket: takeProfitBracket,
			newPrice: order.takeProfit,
			bracketType: BracketType.TakeProfit,
		});

		// Update the object of the stop-loss bracket order
		this._updateOrdersBracket({
			parent: order,
			bracket: stopLossBracket,
			newPrice: order.stopLoss,
			bracketType: BracketType.StopLoss,
		});
	}

	/** Cancels a single order with a given ID */
	public cancelOrder(orderId: string): Promise<void> {
		const order = this._orderById[orderId];
		const handler = () => {
			order.status = OrderStatus.Canceled;
			this._updateOrder(order);

			this._getBrackets(order.id)
				.forEach((bracket: Order) => this.cancelOrder(bracket.id));

			return Promise.resolve();
		};

		return handler();
	}

	/**
	 * Builds the Account Manager that displays trading information.
	 * If this method is not implemented the AM will be empty with just the "Trade" button displayed.
	 */
	public accountManagerInfo(): AccountManagerInfo {
		// Data object for the "Account Summary" row
		const summaryProps: AccountManagerSummaryField[] = [
			{
				text: 'Balance',
				wValue: this._balanceValue,
				formatter: StandardFormatterName.Fixed, // Default value
				isDefault: true,
			},
			{
				text: 'Equity',
				wValue: this._equityValue,
				formatter: StandardFormatterName.Fixed, // Default value
				isDefault: true,
			},
		];

		return {
			accountTitle: 'Trading Demo Account',
			// Custom fields that are displayed in the "Account Summary" row
			summary: summaryProps,
			// Columns that build the "Orders" page
			orderColumns: ordersPageColumns,
			// Columns that build the "Positions" page
			positionColumns: positionsPageColumns,
			// Columns that build the custom "Account Summary" page
			pages: [
				{
					id: 'accountsummary',
					title: 'Account Summary',
					tables: [
						{
							id: 'accountsummary',
							columns: accountSummaryColumns,
							getData: () => {
								return Promise.resolve([this._accountManagerData]);
							},
							initialSorting: {
								property: 'balance',
								asc: false,
							},
							changeDelegate: this._amChangeDelegate,
						},
					],
				},
			],
			// Function to create a custom context menu in the Account Manager
			contextMenuActions: (contextMenuEvent: MouseEvent, activePageActions: ActionMetaInfo[]) => {
				return Promise.resolve(this._bottomContextMenuItems(activePageActions));
			},
		};
	}

	/** Represents a mock function and returns information about the account with an ID '1' */
	public async accountsMetainfo(): Promise<AccountMetainfo[]> {
		return [
			{
				id: '1' as AccountId,
				name: 'Demo account',
			},
		];
	}

	/**
	 * Returns an array of `ActionMetaInfo` elements by calling the `defaultContextMenuActions` method of the Trading Host.
	 * Each `ActionMetaInfo` element represents one context menu item.
	 *
	 * The library calls `chartContextMenuActions` when users open the context menu on the chart.
	 * This method also renders the "Trade" button in the context menu.
	 */
	public chartContextMenuActions(
		_context: TradeContext,
		_options?: DefaultContextMenuActionsParams | undefined
	): Promise<ActionMetaInfo[]> {
		return this._host.defaultContextMenuActions(_context);
	}

	/**
	 * Enables a dialog that allows adding bracket orders to a position.
	 * The library calls this method when users modify existing position with bracket orders.
	 */
	public async editPositionBrackets(positionId: string, modifiedBrackets: Brackets): Promise<void> {
		// Retrieve the position object using its ID
		const position = this._positionById[positionId];
		// Retrieve all brackets associated with this position
		const positionBrackets = this._getBrackets(positionId);

		// Create a modified position object based on the original position
		const modifiedPosition: Position = { ...position };

		// Update take-profit and stop-loss prices in the modified position object if they are provided
		modifiedPosition.takeProfit ??= modifiedBrackets.takeProfit;
		modifiedPosition.stopLoss ??= modifiedBrackets.stopLoss;

		this._updatePosition(modifiedPosition);

		// Find the take-profit and stop-loss brackets from the position's brackets
		const takeProfitBracket = positionBrackets.find((bracket: Order) => bracket.limitPrice !== undefined);
		const stopLossBracket = positionBrackets.find((bracket: Order) => bracket.stopPrice !== undefined);

		// Update the object of the take-profit bracket order
		this._updatePositionsBracket({
			parent: modifiedPosition,
			bracket: takeProfitBracket,
			bracketType: BracketType.TakeProfit,
			newPrice: modifiedBrackets.takeProfit,
		});

		// Update the object of the stop-loss bracket order
		this._updatePositionsBracket({
			parent: modifiedPosition,
			bracket: stopLossBracket,
			bracketType: BracketType.StopLoss,
			newPrice: modifiedBrackets.stopLoss,
		});
	}

	/** Closes a position for a specified ID */
	public async closePosition(positionId: string): Promise<void> {
		const position = this._positionById[positionId];

		await this.placeOrder({
			symbol: position.symbol,
			side: changeSide(position.side),
			type: OrderType.Market,
			qty: position.qty,
		} as unknown as PreOrder);
	}

	/** Reverses the side of a position */
	public async reversePosition(positionId: string): Promise<void> {
		const position = this._positionById[positionId];

		await this.placeOrder({
			symbol: position.symbol,
			side: changeSide(position.side),
			type: OrderType.Market,
			qty: position.qty * 2,
		} as unknown as PreOrder);
	}

	/**
	 * Cancels multiple orders.
	 * This can be done for a given symbol and side or for a list of orders.
	 */
	public async cancelOrders(symbol: string, side: Side | undefined, ordersIds: string[]): Promise<void> {
		await Promise.all(ordersIds.map((orderId: string) => {
			return this.cancelOrder(orderId);
		}));
	}

	/**
	 * Subscribes to updates of the equity value.
	 * The library calls this method when users open Order Ticket.
	 */
	public subscribeEquity(): void {
		this._equityValue.subscribe(this._handleEquityUpdate, { callWithLast: true });
	}

	/**
	 * Unsubscribes from updates of the equity value.
	 * The library calls this method when users close Order Ticket.
	 */
	public unsubscribeEquity(): void {
		this._equityValue.unsubscribe(this._handleEquityUpdate);
	}

	/** *** PRIVATE APIs *** **/

	/** Retrieves all orders stored in the `_orderById` map and returns an array containing all orders */
	private _orders(): Order[] {
		return Object.values(this._orderById);
	}

	/** Updates a given order */
	private _updateOrder(order: Order): void {
		// Define execution checks for different order sides and types
		const executionChecks = {
			[Side.Sell]: {
				// Check for Market order: whether the order has a price
				[OrderType.Market]: () => !!order.price,
				// Check for Limit order: whether the limit price is defined and the last price is greater than or equal to the limit price
				[OrderType.Limit]: () => order.limitPrice !== undefined && order.last >= order.limitPrice,
				// Check for Stop order: whether the stop price is defined and the last price is less than or equal to the stop price
				[OrderType.Stop]: () => order.stopPrice !== undefined && order.last <= order.stopPrice,
				// Stop-limit orders are not implemented, so the check function always returns `false`
				[OrderType.StopLimit]: () => false,
			},

			[Side.Buy]: {
				[OrderType.Market]: () => !!order.price,
				[OrderType.Limit]: () => order.limitPrice !== undefined && order.last <= order.limitPrice,
				[OrderType.Stop]: () => order.stopPrice !== undefined && order.last >= order.stopPrice,
				[OrderType.StopLimit]: () => false,
			},
		};

		// Check if the order already exists
		const hasOrderAlready = Boolean(this._orderById[order.id]);

		// Store or update the order in the `_orderById` map
		if (hasOrderAlready) {
			Object.assign(this._orderById[order.id], order);
		} else {
			this._orderById[order.id] = order;

			// Subscribe to real-time data updates if the order is new
			this._subscribeData(order.symbol, order.id, (last: number) => {
				// Ignore if the last price hasn't changed
				if (order.last === last) {
					return;
				}

				// Update the order's last price
				order.last = last;
				if (order.price == null) {
					order.price = order.last;
				}

				// Check if the order should be executed based on its status, side, and type
				if (order.status === OrderStatus.Working && executionChecks[order.side][order.type]()) {
					const positionData = { ...order };

					// Update order properties
					order.price = order.last;
					order.avgPrice = order.last;

					// Create a position for the order
					const position = this._createPositionForOrder(positionData);

					// Update the order status to "Filled"
					order.status = OrderStatus.Filled;
					this._updateOrder(order);

					// Update the status of associated bracket orders to "Working" and link them to the created position
					this._getBrackets(order.id).forEach((bracket: Order) => {
						bracket.status = OrderStatus.Working;
						bracket.parentId = position.id;
						bracket.parentType = ParentType.Position;

						this._updateOrder(bracket);
					});
				}

				/*
				Update the order object with the `last` value.
				This value is displayed in the Account Manager.
				*/
				this._updateOrderLast(order);
			});
		}

		// Notify the library that order data should be updated by calling the `orderUpdate` method of the Trading Host
		this._host.orderUpdate(order);

		// Update the take-profit and stop-loss values of the parent entity if applicable
		if (order.parentId !== undefined) {
			// Define the entity type: order or position
			const entity = order.parentType === ParentType.Position
				? this._positionById[order.parentId]
				: this._orderById[order.parentId];

			// If the parent entity doesn't exist, exit `_updateOrder`
			if (entity === undefined) {
				return;
			}

			// Update the take-profit values based on the order status
			if (order.limitPrice !== undefined) {
				entity.takeProfit = order.status !== OrderStatus.Canceled
					? order.limitPrice
					: undefined;
			}

			// Update the stop-loss based on the order status
			if (order.stopPrice !== undefined) {
				entity.stopLoss = order.status !== OrderStatus.Canceled
					? order.stopPrice
					: undefined;
			}

			// If the parent entity is a position, update this position by calling `_updatePosition`
			if (order.parentType === ParentType.Position) {
				return this._updatePosition(entity as Position);
			}

			// If the parent entity is an order, update this order by calling `_updateOrder` recursively
			this._updateOrder(entity as Order);
		}
	}

	/** Gets a take-profit order by searching among the orders associated with a given order or position that has a non-undefined `limitPrice` */
	private _getTakeProfitBracket(entity: Order | Position): Order | undefined {
		return this._getBrackets(entity.id).find((bracket: Order) => bracket.limitPrice !== undefined);
	}

	/** Gets a stop-loss order by searching among the orders associated with a given order or position that has a non-undefined `stopPrice` */
	private _getStopLossBracket(entity: Order | Position): Order | undefined {
		return this._getBrackets(entity.id).find((bracket: Order) => bracket.stopPrice !== undefined);
	}

	/** Updates the orders' bracket orders based on the provided parameters */
	private _updateOrdersBracket(params: UpdateParentBracketParams): void {
		const {
			parent,
			bracket,
			bracketType,
			newPrice,
		} = params;

		// Check if the bracket should be canceled
		const shouldCancelBracket = bracket !== undefined && newPrice === undefined;

		if (shouldCancelBracket) {
			// Set the bracket order status to "Canceled"
			this._setCanceledStatusAndUpdate(bracket);

			return;
		}

		if (newPrice === undefined) {
			return;
		}

		// Check if a new bracket should be created
		const shouldCreateNewBracket = bracket === undefined;

		// Handle the take-profit bracket order type
		if (bracketType === BracketType.TakeProfit) {
			const takeProfitBracket = shouldCreateNewBracket
				? this._createTakeProfitBracket(parent)
				: { ...bracket, limitPrice: newPrice };

			this._updateOrder(takeProfitBracket);

			return;
		}

		// Handle the stop-loss bracket order type
		if (bracketType === BracketType.StopLoss) {
			const stopLossBracket = shouldCreateNewBracket
				? this._createStopLossBracket(parent)
				: { ...bracket, stopPrice: newPrice };

			this._updateOrder(stopLossBracket);

			return;
		}
	}

	/** Gets an array of bracket order objects associated with a specific parent ID */
	private _getBrackets(parentId: string): Order[] {
		return this._orders().filter(
			(order: Order) => order.parentId === parentId
				&& activeOrderStatuses.includes(order.status)
		);
	}

	/** Creates custom items in the Account Manager context menu */
	private _bottomContextMenuItems(activePageActions: ActionMetaInfo[]): ActionMetaInfo[] {
		const separator: MenuSeparator = { separator: true };
		const sellBuyButtonsVisibility = this._host.sellBuyButtonsVisibility();

		if (activePageActions.length) {
			activePageActions.push(separator);
		}

		return activePageActions.concat([
			// Create button that modifies the visibility of the "Sell" and "Buy" buttons
			{
				text: 'Show Buy/Sell Buttons',
				action: () => {
					if (sellBuyButtonsVisibility) {
						sellBuyButtonsVisibility.setValue(!sellBuyButtonsVisibility.value());
					}
				},
				checkable: true,
				checked: sellBuyButtonsVisibility !== null && sellBuyButtonsVisibility.value(),
			},
			// Create button that opens "Chart settings → Trading" dialog
			{
				text: 'Trading Settings...',
				action: () => {
					this._host.showTradingProperties();
				},
			},
		]);
	}

	/** Creates a working order based on the `PreOrder` object and returns an object that contains information about this order */
	private _createOrder(preOrder: PreOrder): Order {
		return {
			id: `${this._idsCounter++}`,
			duration: preOrder.duration, // Duration is not used in this sample
			limitPrice: preOrder.limitPrice,
			pl: 0,
			qty: preOrder.qty,
			side: preOrder.side || Side.Buy,
			status: OrderStatus.Working,
			stopPrice: preOrder.stopPrice,
			symbol: preOrder.symbol,
			type: preOrder.type || OrderType.Market,
			takeProfit: preOrder.takeProfit,
			stopLoss: preOrder.stopLoss,
		};
	}

	/** Creates an order with bracket orders and returns an array of data objects representing these orders */
	private _createOrderWithBrackets(preOrder: PreOrder): Order[] {
		const orders: Order[] = [];

		const order: Order = this._createOrder(preOrder);

		orders.push(order);

		// If true, create a take-profit order
		if (order.takeProfit !== undefined) {
			const takeProfit = this._createTakeProfitBracket(order);

			orders.push(takeProfit);
		}

		// If true, create a stop-loss order
		if (order.stopLoss !== undefined) {
			const stopLoss = this._createStopLossBracket(order);

			orders.push(stopLoss);
		}

		return orders;
	}

	/** Creates a take-profit order and returns an object that contains information about this order */
	private _createTakeProfitBracket(entity: Order | Position): Order {
		return {
			symbol: entity.symbol,
			qty: entity.qty,
			id: `${this._idsCounter++}`,
			parentId: entity.id,
			parentType: ParentType.Order,
			limitPrice: entity.takeProfit,
			side: changeSide(entity.side),
			status: OrderStatus.Inactive,
			type: OrderType.Limit,
		};
	}

	/** Creates a stop-loss order and returns an object that contains information about this order */
	private _createStopLossBracket(entity: Order | Position) {
		return {
			symbol: entity.symbol,
			qty: entity.qty,
			id: `${this._idsCounter++}`,
			parentId: entity.id,
			parentType: ParentType.Order,
			stopPrice: entity.stopLoss,
			price: entity.stopPrice,
			side: changeSide(entity.side),
			status: OrderStatus.Inactive,
			type: OrderType.Stop,
		};
	}

	/** Subscribes to receive real-time quotes for a specific symbol */
	private _subscribeData(symbol: string, id: string, updateFunction: (last: number) => void): void {
		this._quotesProvider.subscribeQuotes(
			[],
			[symbol],
			(symbols: QuoteData[]) => {
				const deltaData = symbols[0];
				if (deltaData.s !== 'ok') {
					return;
				}

				if (typeof deltaData.v.lp === 'number') {
					updateFunction(deltaData.v.lp);
				}
			},
			getDatafeedSubscriptionId(id)
		);
	}

	/** Unsubscribes the data listener associated with the provided ID from receiving real-time quote updates */
	private _unsubscribeData(id: string): void {
		this._quotesProvider.unsubscribeQuotes(getDatafeedSubscriptionId(id));
	}

	/** Creates a position for a particular order and returns a position data object */
	private _createPositionForOrder(order: Order): Position {
		// Create the position ID from the order's symbol
		const positionId = order.symbol;

		// Retrieve existing position object by ID if it exists
		let position = this._positionById[positionId];
		// Extract order side and quantity
		// const orderSide = order.side;
		const orderQty = order.qty;

		// Check whether the order is a bracket order
		const isPositionClosedByBracket = order.parentId !== undefined;

		order.avgPrice = order.price;

		// Update the position object if it already exists, otherwise create a new one
		if (position) {
			// Compare new order and existing position sides
			const sign = order.side === position.side ? 1 : -1;
			// Calculate average price based on the order and position sides: "Buy" or "Sell"
			if (sign > 0) {
				position.avgPrice = (position.qty * position.avgPrice + order.qty * order.price) / (position.qty + order.qty);
			} else {
				position.avgPrice = position.avgPrice;

				const amountToClose = Math.min(orderQty, position.qty);
				this._accountManagerData.balance += (order.price - position.avgPrice) * amountToClose * (position.side === Side.Sell ? -1 : 1);
			}

			// Recalculate position quantity
			position.qty = position.qty + order.qty * sign;

			// Get an array of bracket orders associated with the position ID
			const brackets = this._getBrackets(position.id);

			// Check the position quantity: whether it is closed
			if (position.qty <= 0) {
				brackets.forEach((bracket: Order) => {
					// If the executed order is a bracket order, set its status to "Filled"
					if (isPositionClosedByBracket) {
						this._setFilledStatusAndUpdate(bracket);

						return;
					}

					// For other orders, set their status to "Canceled"
					this._setCanceledStatusAndUpdate(bracket);
				});

				// Change position side and reverse the quantity sign from negative to positive
				position.side = changeSide(position.side);
				position.qty *= -1;
			} else {
				/*
				If the position quantity is positive (which indicates the position is open),
				go through brackets and update their side and quantity to match the position's side and quantity.
				*/
				brackets.forEach((bracket: Order) => {
					bracket.side = changeSide(position.side);
					bracket.qty = position.qty;

					this._updateOrder(bracket);
				});
			}
		} else {
			// Create a new position object if it doesn't exist
			position = {
				...order,
				id: positionId,
				avgPrice: order.price,
			};
		}

		// Update position and Account Manager data
		this._updatePosition(position);
		this._recalculateAMData();

		// Notify the library about "Profit and loss" updates
		this._host.plUpdate(position.symbol, position.pl);
		this._host.positionPartialUpdate(position.id, position);
		// Recalculate values in the Account Manager
		this._recalculateAMData();

		return position;
	}

	/**
	 * Updates order objects by calling the `orderPartialUpdate` method of the Trading Host.
	 * `orderPartialUpdate` is used if the Account Manager has custom columns.
	 * In this example, the Account Manager has the custom column called "Last".
	 */
	private _updateOrderLast(order: Order): void {
		this._host.orderPartialUpdate(order.id, { last: order.last });
	}

	/** Updates a given position */
	private _updatePosition(position: Position): void {
		// Check if position already exists
		const hasPositionAlready = Boolean(this._positionById[position.id]);

		/*
		If the position exists and its quantity is zero, unsubscribe from real-time data updates,
		remove it from positions list, and delete from the `_positionById` map.
		*/
		if (hasPositionAlready && !position.qty) {
			this._unsubscribeData(position.id);
			const index = this._positions.indexOf(position);
			if (index !== -1) {
				this._positions.splice(index, 1);
			}

			delete this._positionById[position.id];

			// Notify the library about position update
			this._host.positionUpdate(position);
			return;
		}

		// If the position doesn't exist, add it to the positions list and subscribe to real-time data updates
		if (!hasPositionAlready) {
			this._positions.push(position);

			this._subscribeData(position.symbol, position.id, (last: number) => {
				// If the last price is the same as the current position's last price, do nothing
				if (position.last === last) {
					return;
				}

				// Update position's last price and profit (pl aka profit and loss)
				position.last = last;
				position.pl = (position.last - position.price) * position.qty * (position.side === Side.Sell ? -1 : 1);

				// Notify the library about "Profit and loss" updates
				this._host.plUpdate(position.symbol, position.pl);
				this._host.positionPartialUpdate(position.id, position);
				// Recalculate values in the Account Manager
				this._recalculateAMData();
			});
		}

		// Update position in the `_positionById` map
		this._positionById[position.id] = position;

		this._host.positionUpdate(position);
	}

	/** Updates the positions' bracket orders based on the provided parameters */
	private _updatePositionsBracket(params: UpdateParentBracketParams): void {
		const {
			parent,
			bracket,
			bracketType,
			newPrice,
		} = params;

		// Check if the bracket should be canceled
		const shouldCancelBracket = bracket !== undefined && newPrice === undefined;

		if (shouldCancelBracket) {
			// Set the bracket order status to "Canceled"
			this._setCanceledStatusAndUpdate(bracket);

			return;
		}

		if (newPrice === undefined) {
			return;
		}

		// Check if a new bracket should be created
		const shouldCreateNewBracket = bracket === undefined;

		// Handle the take-profit bracket order type
		if (bracketType === BracketType.TakeProfit) {
			// If `true`, create a new take-profit bracket
			if (shouldCreateNewBracket) {
				const takeProfitBracket = this._createTakeProfitBracket(parent);

				takeProfitBracket.status = OrderStatus.Working;
				takeProfitBracket.parentType = ParentType.Position;

				this._updateOrder(takeProfitBracket);

				return;
			}

			// Update the existing bracket order with a new take-profit price
			bracket.limitPrice = newPrice;
			bracket.takeProfit = newPrice;

			this._updateOrder(bracket);

			return;
		}

		// Handle the stop-loss bracket order type
		if (bracketType === BracketType.StopLoss) {
			// If `true`, create a new stop-loss bracket
			if (shouldCreateNewBracket) {
				const stopLossBracket = this._createStopLossBracket(parent);

				stopLossBracket.status = OrderStatus.Working;
				stopLossBracket.parentType = ParentType.Position;

				this._updateOrder(stopLossBracket);

				return;
			}

			// Update the existing bracket order with a new stop-loss price
			bracket.stopPrice = newPrice;
			bracket.stopLoss = newPrice;

			this._updateOrder(bracket);

			return;
		}
	}

	/** Sets the order status to "Canceled" and updates the order object */
	private _setCanceledStatusAndUpdate(order: Order): void {
		order.status = OrderStatus.Canceled;

		this._updateOrder(order);
	}

	/** Sets the order status to "Filled" and updates the order object */
	private _setFilledStatusAndUpdate(order: Order): void {
		order.status = OrderStatus.Filled;

		this._updateOrder(order);
	}

	private _recalculateAMData(): void {
		let pl = 0;
		this._positions.forEach((position: Position) => {
			pl += position.pl || 0;
		});

		this._accountManagerData.pl = pl;
		this._accountManagerData.equity = this._accountManagerData.balance + pl;

		// Evoke event: notify all subscribers that values in the Account Manager are updated
		this._amChangeDelegate.fire(this._accountManagerData);
	}

	/** Handles updates to the equity value by calling the `equityUpdate` method of the Trading Host */
	private _handleEquityUpdate = (value: number): void => {
		this._host.equityUpdate(value);
	};
}

/** Changes the position or order side to its opposite and returns the modified `side` property */
function changeSide(side: Side): Side {
	return side === Side.Buy ? Side.Sell : Side.Buy;
}

/** Gets a datafeed subscription ID */
function getDatafeedSubscriptionId(id: string): string {
	return `SampleBroker-${id}`;
}
