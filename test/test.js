var Temporal = require('../');
var Sequelize = require('sequelize');
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var assert = chai.assert;
var eventually = assert.eventually;

describe('Read-only API', function(){
  var sequelize, User, UserHistory;

  function freshDB(){
    // overwrites the old SQLite DB
    sequelize = new Sequelize('', '', '', {
      dialect: 'sqlite',
      storage: __dirname + '/.test.sqlite'
    });
    User = Temporal(sequelize.define('User', {
      name: Sequelize.TEXT
    }), sequelize);
    UserHistory = sequelize.models.UserHistory;
    return sequelize.sync({ force: true });
  }

  function freshDBWithFullModeAndParanoid() {
    sequelize = new Sequelize('', '', '', {
      dialect: 'sqlite',
      storage: __dirname + '/.test.sqlite'
    });
    User = Temporal(sequelize.define('User', {
      name: Sequelize.TEXT
    }, { paranoid: true }), sequelize, { full: true });
    UserHistory = sequelize.models.UserHistory;

    return sequelize.sync({ force: true });
  }

  function assertCount(modelHistory, n, opts){
    // wrapped, chainable promise
    return function(obj){
      return modelHistory.count(opts).then(function(count){
        assert.equal(n, count, "history entries")
        return obj;
      });
    }
  }

  describe('hooks', function(){
    beforeEach(freshDB);
    it('onCreate: should not store the new version in history db' , function(){
      return User.create({ name: 'test' }).then(assertCount(UserHistory, 0));
    });
    it('onUpdate/onDestroy: should save to the historyDB' , function(){
      return User.create()
      .then(assertCount(UserHistory,0))
      .then(function(user){
        user.name = "foo";
        return user.save();
      }).then(assertCount(UserHistory,1))
      .then(function(user){
        return user.destroy();
      }).then(assertCount(UserHistory,2))
    });
    it('onUpdate: should store the previous version to the historyDB' , function(){
      return User.create({name: "foo"})
      .then(assertCount(UserHistory,0))
      .then(function(user){
        user.name = "bar";
        return user.save();
      }).then(assertCount(UserHistory,1))
      .then(function(){
        return UserHistory.findAll();
      }).then(function(users){
        assert.equal(users.length,1, "only one entry in DB");
        assert.equal(users[0].name, "foo", "previous entry saved");
      }).then(function(user){
        return User.findOne();
      }).then(function(user){
        return user.destroy();
      }).then(assertCount(UserHistory,2))
    });
    it('onDelete: should store the previous version to the historyDB' , function(){
      return User.create({name: "foo"})
      .then(assertCount(UserHistory,0))
      .then(function(user){
        return user.destroy();
      }).then(assertCount(UserHistory,1))
      .then(function(){
        return UserHistory.findAll();
      }).then(function(users){
        assert.equal(users.length,1, "only one entry in DB");
        assert.equal(users[0].name, "foo", "previous entry saved");
      });
    });
  });

  describe('transactions', function(){
    beforeEach(freshDB);
    it('revert on failed transactions' , function(){
      return sequelize.transaction().then(function(t){
        var opts = {transaction: t};
        return User.create(opts)
        .then(assertCount(UserHistory,0, opts))
        .then(function(user){
          user.name = "foo";
          return user.save(opts);
        }).then(assertCount(UserHistory,1, opts))
        .then(function(){
          t.rollback();
        });
      }).then(assertCount(UserHistory,0));
    });
  });

  describe('bulk update', function(){
    beforeEach(freshDB);
    it('should archive every entry' , function(){
      return User.bulkCreate([
        {name: "foo1"},
        {name: "foo2"},
      ]).then(assertCount(UserHistory,0))
      .then(function(){
        return User.update({ name: 'updated-foo' }, {where: {}});
      }).then(assertCount(UserHistory,2))
    });
    it('should revert under transactions' , function(){
      return sequelize.transaction().then(function(t){
        var opts = {transaction: t};
        return User.bulkCreate([
          {name: "foo1"},
          {name: "foo2"},
        ], opts).then(assertCount(UserHistory,0,opts))
        .then(function(){
          return User.update({ name: 'updated-foo' }, {where: {}, transaction: t});
        }).then(assertCount(UserHistory,2, opts))
        .then(function(){
          t.rollback();
        });
      }).then(assertCount(UserHistory,0));
    });

  });

  describe('bulk destroy/truncate', function(){
    beforeEach(freshDB);
    it('should archive every entry' , function(){
      return User.bulkCreate([
        {name: "foo1"},
        {name: "foo2"},
      ]).then(assertCount(UserHistory,0))
      .then(function(){
        return User.destroy({
          where: {},
          truncate: true // truncate the entire table
        });
      }).then(assertCount(UserHistory,2))
    });
    it('should revert under transactions' , function(){
      return sequelize.transaction().then(function(t){
        var opts = {transaction: t};
        return User.bulkCreate([
          {name: "foo1"},
          {name: "foo2"},
        ], opts).then(assertCount(UserHistory,0,opts))
        .then(function(){
          return User.destroy({
            where: {},
            truncate: true, // truncate the entire table
            transaction: t
          });
        }).then(assertCount(UserHistory,2, opts))
        .then(function(){
          t.rollback();
        });
      }).then(assertCount(UserHistory,0));
    });


  });

  describe('read-only ', function(){
    it('should forbid updates' , function(){
      var userUpdate = UserHistory.create().then(function(uh){
        uh.update({name: 'bla'});
      });
      return assert.isRejected(userUpdate, Error, "Validation error");
    });
    it('should forbid deletes' , function(){
      var userUpdate = UserHistory.create().then(function(uh){
        uh.destroy();
      });
      return assert.isRejected(userUpdate, Error, "Validation error");
    });
  });

  describe('interference with the original model', function(){

    beforeEach(freshDB);

    it('shouldn\'t delete instance methods' , function(){
      Fruit = Temporal(sequelize.define('Fruit', {
        name: Sequelize.TEXT
      }), sequelize);
      Fruit.prototype.sayHi = function(){ return 2;}
      return sequelize.sync().then(function(){
        return Fruit.create();
      }).then(function(f){
        assert.isFunction(f.sayHi);
        assert.equal(f.sayHi(), 2);
      });
    });

    it('shouldn\'t interfere with hooks of the model' , function(){
      var triggered = 0;
      Fruit = Temporal(sequelize.define('Fruit', {
        name: Sequelize.TEXT
      }, {
        hooks:{
          beforeCreate: function(){ triggered++;}
        }
      }), sequelize);
      return sequelize.sync().then(function(){
        return Fruit.create();
      }).then(function(f){
        assert.equal(triggered, 1,"hook trigger count");
      });
    });

    it('shouldn\'t interfere with setters' , function(){
      var triggered = 0;
      Fruit = Temporal(sequelize.define('Fruit', {
        name: {
          type: Sequelize.TEXT,
          set: function(){
            triggered++;
          }
        }
      }), sequelize);
      return sequelize.sync().then(function(){
        return Fruit.create({name: "apple"});
      }).then(function(f){
        assert.equal(triggered, 1,"hook trigger count");
      });
    });

  });

  describe('full mode', function() {

    beforeEach(freshDBWithFullModeAndParanoid);

    it('onCreate: should store the new version in history db' , function(){
      return User.create({ name: 'test' })
        .then(function() {
          return UserHistory.findAll();
        })
        .then(function(histories) {
          assert.equal(1, histories.length);
          assert.equal('test', histories[0].name);
        });
    });

    it('onUpdate: should store the new version to the historyDB' , function(){
      return User.create({ name: 'test' })
        .then(function(user) {
          return user.update({ name: 'renamed' });
        })
        .then(function() {
          return UserHistory.findAll();
        })
        .then(function(histories) {
          assert.equal(histories.length, 2, 'two entries in DB');
          assert.equal(histories[0].name, 'test', 'first version saved');
          assert.equal(histories[1].name, 'renamed', 'second version saved');
        });
    });

    it('onDelete: should store the previous version to the historyDB' , function(){
      return User.create({ name: 'test' })
        .then(function(user) {
          return user.update({ name: 'renamed' });
        })
        .then(function(user) {
          return user.destroy();
        })
        .then(function() {
          return UserHistory.findAll();
        })
        .then(function(histories) {
          assert.equal(histories.length, 3, 'three entries in DB');
          assert.equal(histories[0].name, 'test', 'first version saved');
          assert.equal(histories[1].name, 'renamed', 'second version saved');
          assert.notEqual(histories[2].deletedAt, null, 'deleted version saved');
        });
    });

    it('onRestore: should store the new version to the historyDB' , function(){
      return User.create({ name: 'test' })
        .then(function(user) {
          return user.destroy();
        })
        .then(function(user) {
          return user.restore();
        })
        .then(function() {
          return UserHistory.findAll();
        })
        .then(function(histories) {
          assert.equal(histories.length, 3, 'three entries in DB');
          assert.equal(histories[0].name, 'test', 'first version saved');
          assert.notEqual(histories[1].deletedAt, null, 'deleted version saved');
          assert.equal(histories[2].deletedAt, null, 'restored version saved');
        });
    });

    it('should revert on failed transactions, even when using after hooks' , function(){
      return sequelize.transaction()
        .then(function(transaction) {
          var options = { transaction: transaction };

          return User.create({ name: 'test' }, options)
            .then(function(user) {
              return user.destroy(options);
            })
            .then(assertCount(UserHistory, 2, options))
            .then(function() {
              return transaction.rollback()
            });
        })
        .then(assertCount(UserHistory,0));
    });

  });

  describe('tests default and custom options for modelPrefix, modelSuffix, idColumn, and dateColumn', function(){
    var defaultOptions = {};
    var customOptions = {modelPrefix: '_', modelSuffix: 'AuditTrail', idColumn: '_atid', dateColumn: '_auditedAt'};
    var someCustomOptions = {modelPrefix: '_', dateColumn: 'hRecordedAt'};

    var DefaultOptionsModel, DefaultOptionsHistory;
    var CustomOptionsModel, CustomOptionsHistory;
    var SomeCustomOptionsModel, SomeCustomOptionsHistory;

    before(function() {
      // overwrites the old SQLite DB
      sequelize = new Sequelize('', '', '', {
        dialect: 'sqlite',
        storage: __dirname + '/.test.sqlite'
      });

      DefaultOptionsModel = Temporal(sequelize.define('DefaultOptions', {
        name: Sequelize.TEXT
      }), sequelize, defaultOptions);

      CustomOptionsModel = Temporal(sequelize.define('CustomOptions', {
        name: Sequelize.TEXT
      }), sequelize, customOptions);

      SomeCustomOptionsModel = Temporal(sequelize.define('SomeCustomOptions', {
        name: Sequelize.TEXT
      }), sequelize, someCustomOptions);

      DefaultOptionsHistory = sequelize.models.DefaultOptionsHistory;
      CustomOptionsHistory = sequelize.models._CustomOptionsAuditTrail;
      SomeCustomOptionsHistory = sequelize.models._SomeCustomOptionsHistory;

      return sequelize.sync({ force: true });
    });

    it('should have a model at key `DefaultOptionsHistory`', function() {
      return assert.exists(DefaultOptionsHistory, '`DefaultOptionsHistory` exists')
    });

    it('should have `hid` as the autoIncrementAttribute using default options', function(){
      return assert.equal(DefaultOptionsHistory.autoIncrementAttribute, 'hid', '`autoIncrementAttribute` is `hid` on `DefaultOptionsHistory` model');
    });

    it('should have an `archivedAt` attribute using default options', function(){
      return assert.exists(DefaultOptionsHistory.attributes.archivedAt, '`archivedAt` exists on `DefaultOptionsHistory` model');
    });

    it('should have a model at key `_CustomOptionsAuditTrail`', function() {
      return assert.exists(CustomOptionsHistory, '`_CustomOptionsAuditTrail` exists');
    });

    it('should have `_atid` as the autoIncrementAttribute using `customOptions`', function(){
      return assert.equal(CustomOptionsHistory.autoIncrementAttribute, '_atid', '`autoIncrementAttribute` is `_atid` on  `CustomtOptionsHistory` model');
    });

    it('should have an `_auditedAt` attribute using `customOptions`', function(){
      return assert.exists(CustomOptionsHistory.attributes._auditedAt, '`_auditedAt` exists on `CustomOptionsHistory` model');
    });

    it(`should still write to custom-named history models`, function(){
      return CustomOptionsModel.create({name: 'custom'})
      .then(function(co) {
        return co.update({name: 'still custom'});
      })
      .then(function(co) {
        return co.update({name: 'still custom again'});
      })
      .then(function(){
        return CustomOptionsModel.findAll();
      })
      .then(function(cos){
        assert.equal(cos.length, 1, 'still only one entry in CustomOptionsModel table');
        assert.equal(cos[0].name, 'still custom again', 'original model is up to date');
      })
      .then(function() {
        return CustomOptionsHistory.findAll();
      })
      .then(function(histories) {
        assert.equal(histories.length, 2, 'two old enties in DB');
        assert.equal(histories[0].name, 'custom', 'first version saved');
        assert.equal(histories[1].name, 'still custom', 'second version saved');
      });
    });

    it('should have a model at key `_SomeCustomOptionsHistory`', function() {
      return assert.exists(SomeCustomOptionsHistory, '`_SomeCustomOptionsHistory` exists');
    });

    it('should have `hid` as the autoIncrementAttribute using `someCustomOptions`, which doesn\'t set a custom `idColumn`', function(){
      return assert.equal(SomeCustomOptionsHistory.autoIncrementAttribute, 'hid', '`autoIncrementAttribute` is `hid` on `SomeCustomOptionsHistory` model');
    });

    it('should have an `hRecordedAt` attribute using `someCustomOptions`', function(){
      return assert.exists(SomeCustomOptionsHistory.attributes.hRecordedAt, '`hRecordedAt` exists on `SomeCustomOptionsHistory` model');
    });

  });

});
