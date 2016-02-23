(function() {
    'use strict';
    
    var app = angular.module('app', []);
    
    app.controller('indexController', function($scope) {
       $scope.hello = 'to the world'; 
    });
})();