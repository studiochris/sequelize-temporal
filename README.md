Temporal Tables for Sequelize
=============================

What is it?
-----------

`sequelize-temporal` (Temporal) creates and maintains insertions to history tables for Sequelize models. These tables hold __historical versions__ of Sequelize instances.

Modifying operations (UPDATE, DELETE) on these tables don't cause permanent changes to entries, but create new versions of them. Hence this might be used to:

- log changes (security/auditing)
- undo functionalities
- track interactions (customer support)

Under the hood, a History table is created using the same structure as the input model, only without constraints. The history table also includes a new primary key (default: `hid`) and an additional date column (default: `archivedAt`)

Under the hood a history table with the same structure, without constraints, and with  is created.

The normal singular/plural naming scheme in Sequelize is used:

- model name: `modelName + History`
- table name: `modelName + Histories`

Installation
------------

```
npm install sequelize-temporal
```

How to use
----------

### 1) Import `sequelize-temporal`

```js
var Sequelize = require('sequelize');
var Temporal = require('sequelize-temporal');
```

Create a sequelize instance and your models, e.g.

```js
var sequelize = new Sequelize('', '', '', {
	dialect: 'sqlite',
	storage: __dirname + '/.test.sqlite'
});
```

### 2) Add the *Temporal* feature to your models

```js
var User = Temporal(sequelize.define('User'), sequelize);
```

The output of `temporal` is its input model, so assigning it's output to your
Model is not necessary, hence it's just the lazy version of:

```js
var User = sequelize.define('User', { ...columns }, { ...options }); // Sequelize Docu
Temporal(User, sequelize);
```

Options
-------

The default syntax for `Temporal` is:

`Temporal(model, sequelizeInstance, options)`

whereas the options are listed here (with default value).

The default values for options maintain backward compatibility with previous versions of `sequelize-temporal`.

| Option        | Type    | Default Value  | Description                                                  |
| ------------- | ------- | -------------- | ------------------------------------------------------------ |
| `blocking`    | Boolean | `true`         | Runs the insert within the sequelize hook chain. Disable for increased performance without warranties. |
| `full`        | Boolean | `false`        | **NOT RECOMMENDED FOR USE CURRENTLY**<br /><br />The description below describes the intended behavior based on the code present, but it doesn't appear to work properly.<br /><br />By default, model instances will only be created in Temporal tables on Sequelize's `beforeUpdate`, `beforeUpsert`, and `beforeDestroy` events. The end result is a table of previous states. The full history of an instance is only available in the Temporal table after an instance has been destroyed.<br /><br />Default Temporal tables can be queried to get the past history of an entity. The current state of the entity only exists in the main table.<br /><br />Full mode triggers Temporal record creation on `afterCreate`, `afterUpsert`, `afterUpdate`, `afterDestroy`, and `afterRestore`.  The end result is a Temporal table of all states, including the current state.<br /><br />Temporal tables created using full mode can be queried to get the full history of an entity. |
| `modelPrefix` | String  | `''`           | Add a prefix to the Temporal model/table's name.             |
| `modelSuffix` | String  | `'History'`    | Add a suffix to the Temporal model/table's name. This may be pluralized automatically by Sequelize for the Temporal table's name. |
| `idColumn`    | String  | `'hid'`        | Name the ID column for the Temporal table.                   |
| `dateColumn`  | String  | `'archivedAt'` | Name the date column for the Temporal table.                 |


Details
--------

See: https://wiki.postgresql.org/wiki/SQL2011Temporal

### History table

History table stores historical versions of rows, which are inserted by triggers on every modifying operation executed on current table. It has the same structure and indexes as current table, but it doesn’t have any constraints. History tables are insert only and creator should prevent other users from executing updates or deletes by correct user rights settings. Otherwise the history can be violated.

### Hooks

Triggers for storing old versions of rows to history table are inspired by referential integrity triggers. They are fired for each row before UPDATE and DELETE (within the same transaction)

### Notes

If you only use Postgres, you might want to have a look at the [Temporal Table](https://github.com/arkhipov/temporal_tables) extension.



License
-------

The MIT License (MIT)

Copyright (c) 2015 BonaVal and other contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

-------

Forked from https://github.com/bonaval/sequelize-temporal
